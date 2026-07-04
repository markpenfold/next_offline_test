/**
 * Utility functions for managing local Parquet shards inside the 
 * Browser's Origin Private File System (OPFS).
 */
import * as duckdb from "@duckdb/duckdb-wasm";

// 🔒 THE CONCURRENCY LOCKS
let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/**
 * Coalesces concurrent boot requests into a single shared execution thread.
 */
async function getSharedDuckDBEngine(): Promise<duckdb.AsyncDuckDB> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
      mvp: {
        mainModule: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm",
        mainWorker: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js",
      },
      eh: {
        mainModule: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-eh.wasm",
        mainWorker: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-eh.worker.js",
      }
    };

    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    
    // 🧠 THE WORKER CORS BYPASS WORKAROUND:
    // 1. Fetch the raw worker code text from the CDN link
    const response = await fetch(bundle.mainWorker!);
    const workerCode = await response.text();
    
    // 2. Create a blob container labeled explicitly as JavaScript code bits
    const blob = new Blob([workerCode], { type: "application/javascript" });
    
    // 3. Generate a temporary "blob:http://localhost:3000/..." absolute path
    const blobURL = URL.createObjectURL(blob);
    
    // 4. Instantiate the Worker using our localized origin proxy string
    const worker = new Worker(blobURL);
    
    // Clean up the URL allocation after execution begins to free memory
    URL.revokeObjectURL(blobURL);

    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    
    dbInstance = db;
    return db;
  })();

  return initPromise;
}

/**
 * Scans the root directory of the OPFS storage layer and compiles 
 * a Set of all available filenames.
 */
export async function getLocalCacheManifest(): Promise<Set<string>> {
  try {
    const root = await navigator.storage.getDirectory();
    const existingFiles = new Set<string>();
    
    for await (const entry of root.values()) {
      if (entry.kind === "file") {
        existingFiles.add(entry.name);
      }
    }
    return existingFiles;
  } catch (err) {
    console.error("Failed to read OPFS directory maps:", err);
    return new Set();
  }
}

/**
 * Checks if a specific file name exists in local storage and is not empty.
 */
export async function checkFileExists(fileName: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(fileName);
    const file = await handle.getFile();
    return file.size > 0;
  } catch {
    return false;
  }
}

/**
 * Directly commits a binary Blob into a designated target file slot in OPFS.
 */
export async function writeBlobToOPFS(fileName: string, data: Blob): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

/**
 * 💡 NEW: Orchestrates the cache check, network fetch, and OPFS storage pipeline.
 * Accepts an optional onLog callback to pass string statuses back to the UI.
 */
export async function getShard(
  categoryOrFileName: string, 
  bucketName: string, 
  onLog?: (msg: string) => void
): Promise<{ success: boolean; fileName: string }> {
  
  // Extract clean category name safely
  let category = categoryOrFileName;
  if (categoryOrFileName.includes("__")) {
    const parts = categoryOrFileName.split("__");
    category = parts[1]; 
  }

  const targetFile = `master_category=${category}/era=post_1900.parquet`;
  
  // 🎯 USE THE UNIFIED FILENAME BUILDER HERE
  const safeLocalFileName = buildLocalFileName(bucketName, category);
  
  const log = (msg: string) => onLog?.(msg);

  log(`🔍 Checking local cache for: "${category}"...`);

  try {
    const fileExists = await checkFileExists(safeLocalFileName);

    if (fileExists) {
      log(`⚡ Cache Hit! "${safeLocalFileName}" is active.`);
      return { success: true, fileName: safeLocalFileName }; 
    }

    log(`📡 Cache Miss. Fetching shard from remote R2 bucket...`);
    const response = await fetch(`/api/download?bucket=${bucketName}&file=${encodeURIComponent(targetFile)}`);      
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    log("Streaming dataset binary content across proxy...");
    const blob = await response.blob();
    
    await writeBlobToOPFS(safeLocalFileName, blob);
    log(`🟢 Successfully downloaded and saved: ${safeLocalFileName}`);
    
    return { success: true, fileName: safeLocalFileName }; 
  } catch (err: any) {
    log(`❌ Process Error: ${err.message}`);
    return { success: false, fileName: safeLocalFileName }; 
  }
}


/**
 * LOADS SHARD INTO DUCKDB
 * Pulls the handle from OPFS and registers it onto the virtual database instance.
 */
export async function loadShardIntoEngine(
  fileName: string,
  onLog?: (msg: string) => void
): Promise<boolean> {
  const log = (msg: string) => onLog?.(msg);
  log(`⚙️ Registering shard window into analytics sandbox engine...`);
  log( `filename is ${fileName}`);

  try {
    const db = await getSharedDuckDBEngine();
    
    log(`📁 Opening local file handles inside OPFS...`);
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName);
    const file = await fileHandle.getFile();

    log(`⚡ Mounting local stream into table context: "${fileName}"`);
    // Native file mapping registration step
    await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, false);
    
    log(`🟢 "${fileName}" is successfully mapped into DuckDB context.`);
    return true;
  } catch (err: any) {
    log(`❌ Load Mounting Error: ${err.message}`);
    console.error(err);
    return false;
  }
}



/**
 * STANDALONE QUERY FUNCTION
 * Connects to the database and pulls random data rows from a specified table workspace name.
 */
export async function getRandomRows(
  tableName: string,
  limit: number = 5,
  onLog?: (msg: string) => void
): Promise<any[] | null> {
  const log = (msg: string) => onLog?.(msg);
  log(`📊 Executing standalone analytical sampling query on table: "${tableName}"`);

  try {
    const db = await getSharedDuckDBEngine();
    const conn = await db.connect();

    const sqlQuery = `SELECT * FROM "${tableName}" ORDER BY random() LIMIT ${limit};`;
    const arrowResult = await conn.query(sqlQuery);
    
    await conn.close();

    const rows = arrowResult.toArray().map((row) => row.toJSON());
    log(`🟢 Isolated sample collection complete.`);
    return rows;
  } catch (err: any) {
    log(`❌ Query Pipeline Error: ${err.message}`);
    console.error(err);
    return null;
  }
}




/**
 * Centralized filename normalizer. 
 * Prevents underscore drift or duplicate stitching bugs.
 */
export function buildLocalFileName(bucketName: string, category: string): string {
  // If the bucket config name already slipped into the category, clean it out first
  const cleanCategory = category.replace(`${bucketName}__`, "").split("__")[0] || category;
  return `${bucketName}__${cleanCategory}__post_1900.parquet`;
}