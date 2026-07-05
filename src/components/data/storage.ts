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
 * Streams blob data straight into your OPFS space
 */
async function writeBlobToOPFS(fileName: string, blob: Blob): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileName, { create: true });
  const writable = await (fileHandle as any).createWritable(); // Cast depending on your TS configuration
  await writable.write(blob);
  await writable.close();
}


/**
 * Orchestrates cache validation, network retrieval, and OPFS persistence.
 */
export async function getShard(
  categoryOrFileName: string, 
  bucketName: string, 
  onLog?: (msg: string) => void
): Promise<{ success: boolean; fileName: string }> {
  const log = (msg: string) => onLog?.(msg);

  // Parse category out safely if passed full raw file nomenclature
  let category = categoryOrFileName;
  if (categoryOrFileName.includes("__")) {
    const parts = categoryOrFileName.split("__");
    category = parts[1]; 
  }

  const targetFile = `master_category=${category}/era=post_1900.parquet`;
  const safeLocalFileName = buildLocalFileName(bucketName, category);

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
 * Loads Shard Into DuckDB context memory.
 */
export async function loadShardIntoEngine(
  fileName: string,
  onLog?: (msg: string) => void
): Promise<boolean> {
  const log = (msg: string) => onLog?.(msg);
  log(`⚙️ Registering shard window into analytics sandbox engine...`);
  log(`Filename target: ${fileName}`);

  try {
    const db = await getSharedDuckDBEngine();
    
    log(`📁 Opening local file handles inside OPFS...`);
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName);
    const file = await fileHandle.getFile();

    log(`⚡ Mounting local stream into table context: "${fileName}"`);
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
 * Discards shard from OPFS memory maps cleanly.
 */
export async function deleteShardFromCache(
  fileName: string, 
  onLog?: (msg: string) => void
): Promise<boolean> {
  const log = (msg: string) => onLog?.(msg);

  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(fileName);
    log(`🗑️ Storage: "${fileName}" successfully removed from OPFS cache.`);
    return true;
  } catch (error: any) {
    if (error.name === "NotFoundError") {
      log(`⚠️ Storage warning: "${fileName}" was already missing or cleared.`);
      return true; 
    }
    log(`❌ Storage Error clearing "${fileName}": ${error.message}`);
    return false;
  }
}


/**
 * MULTI-SHARD TIMELINE COMPILER (FIXED FOR STRING DATES)
 * Extracts the 4-digit year dynamically from mixed date formats and aggregates.
 */
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

    // Inject the clean category label name while keeping original schema
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

    // 🎯 THE FIX:
    // 1. Use 'id' instead of 'uuid' to match your schema keys
    // 2. Extract the first 4 digits from the 'date' string via regex and cast to integer
   const sqlQuery = `
        WITH parsed_timeline AS (
            SELECT 
            id,
            shard_category,
            -- 🎯 The Fix: Match exactly a 4-digit block (\b\d{4}\b) anywhere in the string
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
            AND extracted_year >= 1900 -- Added guard to match your "post_1900" intent
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

/**
 * Centralized filename normalizer. 
 * Prevents underscore drift or duplicate stitching bugs.
 */
export function buildLocalFileName(bucketName: string, category: string): string {
  return `${bucketName}__${category}__post_1900.parquet`;
}

/**
 * Checks if a specific file exists within the OPFS workspace
 */
async function checkFileExists(fileName: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.getFileHandle(fileName, { create: false });
    return true;
  } catch {
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
 * UNLOADS SHARD FROM DUCKDB
 * Drops the registered file handle and frees internal engine memory.
 */
export async function unloadShardFromEngine(
  fileName: string,
  onLog?: (msg: string) => void
): Promise<boolean> {
  const log = (msg: string) => onLog?.(msg);
  log(`⚙️ Unregistering shard window from analytics sandbox engine...`);
  log(`Filename target: ${fileName}`);

  try {
    const db = await getSharedDuckDBEngine();
    
    // Drop the file registration from DuckDB's internal virtual file system mapping
    await db.dropFile(fileName);
    
    log(`🟢 "${fileName}" successfully unmounted from DuckDB context.`);
    return true;
  } catch (err: any) {
    log(`❌ Unload Mounting Error: ${err.message}`);
    console.error(err);
    return false;
  }
}


