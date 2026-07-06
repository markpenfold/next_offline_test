/**
 * Utility functions for managing local Parquet shards inside the 
 * Browser's Origin Private File System (OPFS).
 */
import * as duckdb from "@duckdb/duckdb-wasm";


// 🔒 THE CONCURRENCY LOCKS
let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;
// Concurrency lock to prevent DuckDB catalog race conditions
let isIndexLoading = false;

export const INDEX_TABLE_NAME = 'main.test_index';

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

/*** Scans the root directory of the OPFS storage layer and compiles a Set of all available filenames.*/
export async function getLocalCacheManifest(): Promise<Set<string>> {
  
  try {
    const root = await navigator.storage.getDirectory();
    const existingFiles = new Set<string>();
    
    for await (const entry of root.values()) {
      if (entry.kind === "file") {
        existingFiles.add(entry.name);
      }
    }
    console.log("Get local cache manifest, existingFiles ->", existingFiles)
    return existingFiles;
  } catch (err) {
    console.error("Failed to read OPFS directory maps:", err);
    return new Set();
  }
}

/*** Streams blob data straight into your OPFS space */
async function writeBlobToOPFS(fileName: string, blob: Blob): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileName, { create: true });
  const writable = await (fileHandle as any).createWritable(); 
  await writable.write(blob);
  await writable.close();
}

/*** Orchestrates cache validation, network retrieval, and OPFS persistence.*/
export async function getShard(
  categoryOrFileName: string, 
  bucketName: string, 
  onLog?: (msg: string) => void
): Promise<{ success: boolean; fileName: string }> {
  const log = (msg: string) => onLog?.(msg);
  console.log("Getting a shard, ", categoryOrFileName)

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

/*** Loads Shard Into DuckDB context memory. */
export async function loadShardIntoEngine(
  fileName: string,
  onLog?: (msg: string) => void
): Promise<boolean> {
  const log = (msg: string) => onLog?.(msg);
  console.log("loading shard:", fileName);

  try {
    const db = await getSharedDuckDBEngine();
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName);
    const file = await fileHandle.getFile();

    await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, false);
    return true;
  } catch (err: any) {
    log(`❌ Load Mounting Error: ${err.message}`);
    console.error(err);
    return false;
  }
}

/*** Discards shard from OPFS memory maps cleanly.*/
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

/** * Extracts the 4-digit year dynamically from mixed date formats and aggregates.*/
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

/**Checks if a specific file exists within the OPFS workspace*/
async function checkFileExists(fileName: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.getFileHandle(fileName, { create: false });
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
export async function fetchAvailableIndexes(): Promise<AvailableIndex[]> {
  try {
    const response = await fetch("/api/aggregates/list"); 
    if (!response.ok) throw new Error("Failed to compile remote scanning manifests");
    return await response.json();
  } catch (err) {
    console.error("Error pulling scanned remote catalog list:", err);
    return [];
  }
}

// get a particular index from R2
export async function getMasterIndex(
  era: string,
  tier: string,
  fileName: string,
  onLog?: (msg: string) => void
): Promise<{ success: boolean }> {
  const log = (msg: string) => onLog?.(msg);

  log(`📡 Fetching master index layer from remote storage: "${fileName}"...`);

  try {
    const root = await navigator.storage.getDirectory();

    const response = await fetch(`/api/aggregates?era=${era}&tier=${tier}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    log("Streaming index dataset content across proxy...");
    const blob = await response.blob();
    const fileHandle = await root.getFileHandle(fileName, {
      create: true,
    });

    const writable = await (fileHandle as any).createWritable();

    await writable.write(blob);
    await writable.close();

    // Verify the file that was written
    const savedFile = await fileHandle.getFile();

    log(`🟢 Successfully downloaded and saved index layer: ${fileName}`);

    return { success: true };
  } catch (err: any) {
    console.error("Master index download failed:", err);
    log(`❌ Master Index Process Error: ${err.message}`);
    return { success: false };
  }
}

// Optional utility helper to clear files from local cache
export async function deleteIndexFromOPFS(fileName: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(fileName);
  } catch (err) {
    console.warn(`File already deleted or missing: ${fileName}`, err);
  }
}


export interface AvailableIndex {
  fileName: string;
  tier: string;
  era: string;
  sizeBytes: number;
  handle: FileSystemFileHandle; 
}

export async function scanLocalOPFSIndexes(onLog?: (msg: string) => void): Promise<AvailableIndex[]> {
  const log = (msg: string) => onLog?.(msg);
  const foundIndexes: AvailableIndex[] = [];

  try {
    const root = await navigator.storage.getDirectory();

    // @ts-ignore - TS sometimes forgets OPFS directories are async iterable
    for await (const [name, handle] of root.entries()) {
      if (handle.kind === 'file' && name.endsWith('.parquet') && name.startsWith('index__')) {
        
        const parts = name.replace('.parquet', '').split('__');
        const tier = parts[1] || 'unknown';
        const era = parts[2] || 'unknown';
        
        const file = await handle.getFile();

        foundIndexes.push({
          fileName: name,
          tier,
          era,
          sizeBytes: file.size,
          handle: handle as FileSystemFileHandle 
        });
      }
    }
    
    log(`✅ Discovered ${foundIndexes.length} parquet index files in OPFS cache.`);
    return foundIndexes;
    
  } catch (err: any) {
    log(`❌ Error scanning OPFS directory: ${err.message}`);
    console.error(err);
    return [];
  }
}


// Define your expected return shape for an index entry
export interface IndexRow {
  year: string;
  folderName: string;
  eventCount: string;
  eventUuids: string[];
}


// add index file to the master local Index
export async function insertIndex(
  fileName: string, 
  fileHandle: FileSystemFileHandle, // 👈 Accept the handle from your scanner
  onLog?: (msg: string) => void
): Promise<void> {
  const log = (msg: string) => onLog?.(msg);
  
  const db = await getSharedDuckDBEngine();
  const conn = await db.connect();

  try {
    log(`⚡ Extracting ${fileName} from OPFS and registering to VFS...`);
    
    // 1. Read the file from the handle and register it in DuckDB memory
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    await db.registerFileBuffer(fileName, new Uint8Array(arrayBuffer));

    // 2. Corrected CREATE TABLE syntax
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${INDEX_TABLE_NAME} (
        year BIGINT,
        folder_name VARCHAR,
        event_count BIGINT,
        event_uuids VARCHAR[]
      );
    `);

    log(`📥 Inserting data into ${INDEX_TABLE_NAME} from ${fileName}...`);
    
    // 3. Insert the data
    await conn.query(`
      INSERT INTO ${INDEX_TABLE_NAME} 
      SELECT year, folder_name, event_count, event_uuids 
      FROM read_parquet('${fileName}');
    `);

    log(`✅ Successfully inserted ${fileName}!`);

  } catch (err: any) {
    log(`❌ Error inserting index: ${err.message}`);
    console.error(err);
  } finally {
    // 4. Critical cleanup to prevent memory leaks!
    log(`🧹 Dropping ${fileName} from memory...`);
    try {
      await db.dropFile(fileName);
    } catch (cleanupErr) {
      // Ignore cleanup errors if file was never registered
    }
    await conn.close();
  }
}


export async function buildLocalIndex(onLog?: (msg: string) => void){
  const localIndexFiles = await scanLocalOPFSIndexes(onLog);
  for (const index of localIndexFiles) {
  // Pass the fileName AND the handle we saved in the previous step
  await insertIndex(index.fileName, index.handle, onLog);
  }
}


export async function readMainLocalIndex(){}

export async function readIndexToTable(onLog?: (msg: string) => void): Promise<IndexRow[]> {
  if (isIndexLoading) {
    console.warn("Index load already in progress, returning empty array...");
    return []; 
  }

  isIndexLoading = true;
  const log = (msg: string) => onLog?.(msg);
  log("🔄 loading single index file into db");

  const fileName = 'index__pro__pre_1900.parquet';
  const db = await getSharedDuckDBEngine();
  const conn = await db.connect();

  try {
    // 1. Clean slate with explicit 'main' schema
    await conn.query(`DROP TABLE IF EXISTS ${INDEX_TABLE_NAME};`);
    await conn.query(`
      CREATE TABLE ${INDEX_TABLE_NAME} (
        year BIGINT,
        folder_name VARCHAR,
        event_count BIGINT,
        event_uuids VARCHAR[]
      );
    `);

    // 2. Access OPFS
    const root = await navigator.storage.getDirectory();
    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await root.getFileHandle(fileName, { create: false });
    } catch (e) {
      throw new Error(`File '${fileName}' not found in OPFS root directory.`);
    }

    log(`📂 Found file in OPFS, reading contents...`);
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();

    log(`⚡ Registering file buffer with DuckDB VFS...`);
    await db.registerFileBuffer(fileName, new Uint8Array(arrayBuffer));

    let desc = await conn.query(`DESCRIBE SELECT * FROM read_parquet('${fileName}')`);
    log(`Parquet schema: ${desc}`);

    log(`📥 Inserting data into test_index from ${fileName}...`);
    await conn.query(`
      INSERT INTO ${INDEX_TABLE_NAME} 
      SELECT year, folder_name, event_count, event_uuids FROM read_parquet('${fileName}');
    `);

    log(`✅ Successfully loaded ${fileName} into test_index table.`);

    // 3. Clean up the virtual file buffer to free up WASM memory
    await db.dropFile(fileName);
  
    // 4. Fetch rows
    log("📜 Fetching row contents from test_index...");
    const result = await conn.query(`SELECT * FROM ${INDEX_TABLE_NAME} LIMIT 100;`);
    const rows = result.toArray();

    log(`📋 Found ${rows.length} rows. Formatting for return...`);

    // 5. Map the rows to your interface and handle BigInt conversions safely
    const formattedData: IndexRow[] = rows.map((row) => {
      return {
        year: row.year?.toString() ?? 'N/A',
        folderName: row.folder_name ?? 'N/A',
        eventCount: row.event_count?.toString() ?? 'N/A',
        eventUuids: row.event_uuids ? Array.from(row.event_uuids) : [] 
      };
    });

    return formattedData;

  } catch (err: any) {
    log(`❌ PRINTING DB LOAD ERROR: ${err.message}`);
    console.error(err);
    
    // Re-throw so the calling function (e.g., your React component) knows it failed
    throw err; 
  } finally {
    await conn.close();
    // Always release the lock, even if an error occurred
    isIndexLoading = false;
  }
}