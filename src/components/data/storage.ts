/**
 * Utility functions for managing local Parquet shards inside the 
 * Browser's Origin Private File System (OPFS).
 */
import * as duckdb from "@duckdb/duckdb-wasm";
import { 
  saveToOPFSFolder, 
  getOPFSEntries, 
  deleteOPFSFile, 
  getDirectory 
} from "./manageOPFS";

// 🔒 THE CONCURRENCY LOCKS
let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;
// Concurrency lock to prevent DuckDB catalog race conditions
let isIndexLoading = false;

export const INDEX_TABLE_NAME = 'main.test_index';

export interface AvailableIndex {
  fileName: string;
  tier: "free" | "pro"; 
  era: string;
  cube: string;         
  s3Key?: string;        
  sizeBytes?: number;   
  handle?: FileSystemFileHandle; 
  version:string;
}

export interface IndexRow {
  year: string;
  folderName: string;
  eventCount: string;
  eventUuids: string[];
}

/*** Coalesces concurrent boot requests into a single shared execution thread.*/
export async function getSharedDuckDBEngine(): Promise<duckdb.AsyncDuckDB> {
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
    const response = await fetch(bundle.mainWorker!);
    const workerCode = await response.text();
    
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const blobURL = URL.createObjectURL(blob);
    const worker = new Worker(blobURL);
    URL.revokeObjectURL(blobURL);

    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    
    dbInstance = db;
    return db;
  })();

  return initPromise;
}

/*** Scans indexes/data OPFS subdirectory and compiles a Set of available filenames.*/
export async function getLocalCacheManifest(dirName: "indexes" | "data" = "data"): Promise<Set<string>> {
  try {
    const entries = await getOPFSEntries(dirName);
    const existingFiles = new Set<string>();
    
    for (const entry of entries) {
      console.log("FOUUUUUUUUUOUND: ", entry.name)
      existingFiles.add(entry.name);
    }
    
    console.log(`📂 Get local cache manifest for /${dirName} ->`, existingFiles);
    return existingFiles;
  } catch (err) {
    console.error(`❌ Failed to read OPFS directory maps for /${dirName}:`, err);
    return new Set();
  }
}

/*** Orchestrates cache validation, network retrieval, and OPFS persistence for DATA SHARDS.*/
export async function getShard(
  categoryOrFileName: string, 
  bucketName: string, 
  onLog?: (msg: string) => void
): Promise<{ success: boolean; fileName: string }> {
  const log = (msg: string) => onLog?.(msg);
  console.log("Getting a shard: ", categoryOrFileName);

  let category = categoryOrFileName;
  if (categoryOrFileName.includes("__")) {
    const parts = categoryOrFileName.split("__");
    category = parts[1]; 
  }

  const targetFile = `master_category=${category}/era=post_1900.parquet`;
  const safeLocalFileName = buildLocalFileName(bucketName, category);

  log(`🔍 Checking local cache for data shard: "${category}"...`);

  try {
    const fileExists = await checkFileExists("data", safeLocalFileName);

    if (fileExists) {
      log(`⚡ Cache Hit! "/data/${safeLocalFileName}" is active.`);
      return { success: true, fileName: safeLocalFileName }; 
    }

    log(`📡 Cache Miss. Fetching shard from remote R2 bucket...`);
    const response = await fetch(`/api/download?bucket=${bucketName}&file=${encodeURIComponent(targetFile)}`);      
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    log("Streaming dataset binary content across proxy...");
    const arrayBuffer = await response.arrayBuffer();
    
    // 💾 Use new manager function directly
    await saveToOPFSFolder("data", safeLocalFileName, arrayBuffer);
    log(`🟢 Successfully downloaded and saved to: /data/${safeLocalFileName}`);
    
    return { success: true, fileName: safeLocalFileName }; 
  } catch (err: any) {
    log(`❌ Process Error: ${err.message}`);
    return { success: false, fileName: safeLocalFileName }; 
  }
}

// Loads Shard Into DuckDB context memory from the /data directory.
export async function loadShardIntoEngine(
  fileName: string,
  onLog?: (msg: string) => void
): Promise<boolean> {
  const log = (msg: string) => onLog?.(msg);
  console.log("loading shard:", fileName);

  try {
    const db = await getSharedDuckDBEngine();
    
    // 🎯 Target the /data subfolder specifically
    const dirHandle = await getDirectory("data");
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();

    // Registering the file makes DuckDB know it as `fileName` inside SQL
    await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, false);
    return true;
  } catch (err: any) {
    log(`❌ Load Mounting Error: ${err.message}`);
    console.error(err);
    return false;
  }
}



//Discards shard from OPFS memory maps cleanly.*/
export async function deleteShardFromCache(
  fileName: string, 
  onLog?: (msg: string) => void
): Promise<boolean> {
  const log = (msg: string) => onLog?.(msg);

  // Defaulting to "data" for standard shards, use another func or passing param if needed for indexes
  const success = await deleteOPFSFile("data", fileName);
  if (success) {
    log(`🗑️ Storage: "${fileName}" successfully removed from OPFS cache (/data).`);
  } else {
    log(`⚠️ Storage warning: "${fileName}" was missing or failed to clear.`);
  }
  return success;
}




//Extracts the 4-digit year dynamically from mixed date formats and aggregates.
export async function syncSessionAggregations(
  activeFileNames: string[],
  onLog?: (msg: string) => void
): Promise<any[] | null> {
  const log = (msg: string) => onLog?.(msg);

  if (activeFileNames.length === 0) {
    log("⚠️ No active dataset views mounted.");
    try {
      const db = await getSharedDuckDBEngine();
      const conn = await db.connect();
      await conn.query(`DROP VIEW IF EXISTS aggregated_history;`);
      await conn.close();
    } catch {}
    return [];
  }

  log(`🧮 Compiling cross-shard category matrix across: [${activeFileNames.join(", ")}]`);

  try {
    const db = await getSharedDuckDBEngine();
    const conn = await db.connect();

    const unionChain = activeFileNames
      .map(fileName => {
        let cleanCategory = fileName;
        if (fileName.includes("__")) {
          cleanCategory = fileName.split("__")[1];
        }
        return `SELECT *, '${cleanCategory}' AS shard_category FROM "${fileName}"`;
      })
      .join(" UNION ALL ");

    await conn.query(`CREATE OR REPLACE VIEW aggregated_history AS ${unionChain};`);

    const sqlQuery = `
        WITH parsed_timeline AS (
            SELECT 
            id,
            shard_category,
            TRY_CAST(REGEXP_EXTRACT(date, '\\b\\d{4}\\b') AS INTEGER) AS extracted_year
            FROM aggregated_history
            WHERE date IS NOT NULL
        )
        SELECT 
            extracted_year AS year,
            shard_category,
            COUNT(id)::INTEGER AS event_count,
            LIST(id) AS uuids
        FROM parsed_timeline
        WHERE extracted_year IS NOT NULL 
            AND extracted_year >= 1900
        GROUP BY extracted_year, shard_category
        ORDER BY extracted_year ASC, shard_category ASC;
        `;

    const arrowResult = await conn.query(sqlQuery);
    await conn.close();

    return arrowResult.toArray().map((row) => row.toJSON());
  } catch (err: any) {
    log(`❌ Matrix Compilation Error: ${err.message}`);
    console.error(err);
    return null;
  }
}

/*** Centralized filename normalizer. */
export function buildLocalFileName(bucketName: string, category: string): string {
  return `${bucketName}__${category}__post_1900.parquet`;
}

/**Checks if a specific file exists within an OPFS subdirectory*/
async function checkFileExists(dirName: "indexes" | "data", fileName: string): Promise<boolean> {
  try {
    const dirHandle = await getDirectory(dirName);
    await dirHandle.getFileHandle(fileName, { create: false });
    return true;
  } catch {
    return false;
  }
}

/*** STANDALONE QUERY FUNCTION */
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

    return arrowResult.toArray().map((row) => row.toJSON());
  } catch (err: any) {
    log(`❌ Query Pipeline Error: ${err.message}`);
    console.error(err);
    return null;
  }
}

/*** UNLOADS SHARD FROM DUCKDB */
export async function unloadShardFromEngine(
  fileName: string,
  onLog?: (msg: string) => void
): Promise<boolean> {
  try {
    const db = await getSharedDuckDBEngine();
    await db.dropFile(fileName);
    return true;
  } catch (err: any) {
    console.error(`Failed dropping VFS file handle for ${fileName}:`, err);
    return false;
  }
}

// list indexes using the API
// Updated fetchAvailableIndexes to ensure s3Key is mapped properly
export async function fetchAvailableIndexes(accountId: string): Promise<AvailableIndex[]> {
  try {
    const response = await fetch("/api/aggregates/list", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accountId }),
    });

    if (!response.ok) {
      throw new Error("Failed to compile remote scanning manifests");
    }

    const data = await response.json();
    const rawIndexes = data.indexes || [];

    // Map response keys cleanly into AvailableIndex interface
    return rawIndexes.map((item: any) => ({
      fileName: item.fileName,
      version:item.version,
      tier: item.tier,
      era: item.era,
      cube: item.cube,
      s3Key: item.key || item.s3Key, // Capture R2 Key
      sizeBytes: item.size,
    }));
  } catch (err) {
    console.error("Error pulling scanned remote catalog list:", err);
    return [];
  }
}

//using POST request with accountId and s3Key support
export interface DownloadIndexOptions {
  item: AvailableIndex;
  accountId: string;
  onLog?: (msg: string) => void;
}

export async function getMasterIndex({
  item,
  accountId,
  onLog,
}: DownloadIndexOptions): Promise<{ success: boolean; targetFileName: string }> {
  const log = (msg: string) => onLog?.(msg);

  // 1. Calculate the target local OPFS filename upfront
  const fName = buildLocalIndexFileName(
    item.tier,
    item.cube,
    item.version || "v1",
    item.era
  );

  log(`📡 Fetching master index layer from remote storage: "${fName}"...`);

  try {
    const response = await fetch("/api/aggregates/download/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountId,
        s3Key: item.s3Key, // Exact object path in R2 bucket
        version: item.version || "v1",
        era: item.era,
        tier: item.tier,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    log("Streaming index dataset content across proxy...");
    const arrayBuffer = await response.arrayBuffer();

    // 💾 Save directly to the /indexes/ OPFS folder using fName
    await saveToOPFSFolder("indexes", fName, arrayBuffer);

    log(`🟢 Successfully downloaded and saved index layer: /indexes/${fName}`);

    return { success: true, targetFileName: fName };
  } catch (err: any) {
    console.error("Master index download failed:", err);
    log(`❌ Master Index Process Error: ${err.message}`);
    return { success: false, targetFileName: fName };
  }
}

/**
 * Standard Order: index__<tier>__<cube>__<era>__<version>.parquet
 */
export function buildLocalIndexFileName(
  tier: string,
  cube: string,
  era: string,
  version: string = "v1"
): string {
  const cleanEra = era.replace(/^era=/, "");
  const cleanVersion = version || "v1";
  return `index__${tier}__${cube}__${cleanEra}__${cleanVersion}.parquet`;
}




export async function scanLocalOPFSIndexes(onLog?: (msg: string) => void): Promise<AvailableIndex[]> {
  const log = (msg: string) => onLog?.(msg);
  const foundIndexes: AvailableIndex[] = [];

  try {
    // 🎯 Use OPFS manager helper to fetch entries directly from /indexes
    const entries = await getOPFSEntries("indexes");

    for (const { name, handle } of entries) {
      if (name.endsWith('.parquet') && name.startsWith('index__')) {
        
        const parts = name.replace('.parquet', '').split('__');
        
        const tier = (parts[1] as "free" | "pro") || 'free';
        const cube = parts[2] || 'unknown';
        const era = parts[3] || 'unknown';
        const version = parts[4] || 'v1'; // 👈 Extracted version
        
        const file = await handle.getFile();

        foundIndexes.push({
          fileName: name,
          tier,
          cube,
          era,
          version, // 👈 Included version
          sizeBytes: file.size,
          handle,
          s3Key: "", // Local files don't have an s3Key
        });
      }
    }
    
    log(`✅ Discovered ${foundIndexes.length} parquet index files in OPFS cache (/indexes).`);
    return foundIndexes;
    
  } catch (err: any) {
    log(`❌ Error scanning OPFS /indexes directory: ${err.message}`);
    console.error(err);
    return [];
  }
}

// Modify insertIndex to THROW its errors instead of eating them
export async function insertIndex(
  fileName: string, 
  fileHandle: FileSystemFileHandle, 
  onLog?: (msg: string) => void
): Promise<void> {
  const log = (msg: string) => onLog?.(msg);
  const db = await getSharedDuckDBEngine();
  const conn = await db.connect();

  try {
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    await db.registerFileBuffer(fileName, new Uint8Array(arrayBuffer));

    log(`📥 Merging blocks from ${fileName}...`);
    await conn.query(`
      INSERT INTO ${INDEX_TABLE_NAME} 
      SELECT year, folder_name, event_count, event_uuids FROM read_parquet('${fileName}');
    `);
  } catch (err) {
    throw err; 
  } finally {
    try { await db.dropFile(fileName); } catch(e){}
    await conn.close();
  }
}

// Returns an audit report
export async function buildLocalIndex(onLog?: (msg: string) => void) {
  const log = (msg: string) => onLog?.(msg);
  
  const report = {
    success: true,
    totalFilesProcessed: 0,
    failedFiles: [] as string[],
    errorMessage: ""
  };

  log("🏗️ Initializing DuckDB table structures...");
  const db = await getSharedDuckDBEngine();
  const conn = await db.connect();

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${INDEX_TABLE_NAME} (
        year BIGINT,
        folder_name VARCHAR,
        event_count BIGINT,
        event_uuids VARCHAR[]
      );
    `);
  } catch (err: any) {
    log(`❌ Failed to initialize table schema: ${err.message}`);
    report.success = false;
    report.errorMessage = err.message;
    
    await conn.close();
    return report; 
  } finally {
    await conn.close(); 
  }

  const localIndexFiles = await scanLocalOPFSIndexes(onLog);
  report.totalFilesProcessed = localIndexFiles.length;

  if (localIndexFiles.length === 0) {
    log("ℹ️ No local index shards found in OPFS to merge.");
    return report;
  }

  for (const index of localIndexFiles) {
    try {
      if (!index.handle) {
        log(`⚠️ Skipping ${index.fileName}: Found in cache list but missing a local disk handle.`);
        report.failedFiles.push(index.fileName);
        continue;
      }
      await insertIndex(index.fileName, index.handle, onLog);
    } catch (err: any) {
      log(`❌ Failed compiling shard: ${index.fileName}`);
      report.success = false;
      report.failedFiles.push(index.fileName);
      report.errorMessage = err.message; 
    }
  }

  return report;
}


// Master kill switch if you ever need to clear absolute everything 
// (If you only want to clear indexes or data, use the wipeOPFSFolder helper elsewhere)
export async function wipeOPFS(): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();

    for await (const name of root.keys()) {
      await root.removeEntry(name, { recursive: true });
    }

    let remainingEntries = 0;
    for await (const _ of root.keys()) {
      remainingEntries++;
    }

    const isWiped = remainingEntries === 0;

    if (isWiped) {
      console.log("🧹 OPFS root storage completely wiped! (0 entries remaining)");
    } else {
      console.warn(`⚠️ Wipe incomplete! ${remainingEntries} entries still lock/exist.`);
    }

    return isWiped;
  } catch (error) {
    console.error("❌ Error wiping OPFS storage:", error);
    return false;
  }
}

