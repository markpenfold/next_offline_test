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
import { Eraser } from "lucide-react";

// 🔒 THE CONCURRENCY LOCKS
let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;
// Concurrency lock to prevent DuckDB catalog race conditions
let isIndexLoading = false;

export const INDEX_TABLE_NAME = 'main.test_index';

export interface AvailableIndex {
  key:string;
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
    let blobURL: string | null = null;

    try {
      const DUCKDB_VERSION = "1.28.0";
      const CDN_BASE = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist`;

      const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: `${CDN_BASE}/duckdb-mvp.wasm`,
          mainWorker: `${CDN_BASE}/duckdb-browser-mvp.worker.js`,
        },
        eh: {
          mainModule: `${CDN_BASE}/duckdb-eh.wasm`,
          mainWorker: `${CDN_BASE}/duckdb-browser-eh.worker.js`,
        },
      };

      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      
      // Fetch worker code and create Blob URL to bypass CORS
      const response = await fetch(bundle.mainWorker!);
      if (!response.ok) {
        throw new Error(`Failed to fetch DuckDB worker script: ${response.statusText}`);
      }
      
      const workerCode = await response.text();
      const blob = new Blob([workerCode], { type: "application/javascript" });
      blobURL = URL.createObjectURL(blob);
      
      const worker = new Worker(blobURL);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      
      dbInstance = db;
      return db;
    } catch (error) {
      // Clear initPromise on error so future calls can retry
      initPromise = null;
      throw error;
    } finally {
      // Safely revoke Blob URL only after instantiation finishes
      if (blobURL) {
        URL.revokeObjectURL(blobURL);
      }
    }
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

//shard.masterCategory, shard.tier, shard.version, shard.era, shard.downloadUrl, addLog, 
/*** Orchestrates cache validation, network retrieval, and OPFS persistence for DATA SHARDS.*/
export interface GetShardParams {
  item: AvailableDataShard;
  accountId?: string;
  onLog?: (msg: string) => void;
}

export async function getShard({
  item,
  accountId,
  onLog,
}: GetShardParams): Promise<{ success: boolean; fileName: string }> {
  const log = (msg: string) => onLog?.(msg);

  if (!accountId) {
    log("❌ Action aborted: Active account context is missing or null.");
    return { success: false, fileName: item.fileName };
  }

  log(`🔍 Checking local cache for data shard: "${item.masterCategory}"...`);

  // Use the standardized local filename directly from item
  const safeLocalFileName = item.fileName;

  try {
    // 1. Check local cache first
    const fileExists = await checkFileExists("data", safeLocalFileName);

    if (fileExists) {
      log(`⚡ Cache Hit! "/data/${safeLocalFileName}" is active.`);
      return { success: true, fileName: safeLocalFileName };
    }

    log(`📡 Cache Miss. Fetching shard from remote R2 repository...`);

    // 2. Fetch using POST endpoint
    const response = await fetch("/api/categories/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        key: item.s3Key,
        tier: item.tier,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP error! status: ${response.status}`);
    }

    log("Streaming dataset binary content across proxy...");
    const arrayBuffer = await response.arrayBuffer();

    // 3. Save to local OPFS folder
    await saveToOPFSFolder("data", safeLocalFileName, arrayBuffer);
    log(`🟢 Successfully downloaded and saved to: /data/${safeLocalFileName}`);

    return { success: true, fileName: safeLocalFileName };
  } catch (err: any) {
    log(`❌ Process Error: ${err.message}`);
    return { success: false, fileName: safeLocalFileName };
  }
}

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

// Helper to navigate down relative folder paths in OPFS
async function getSubdirectoryHandle(
  dirPath: string
): Promise<FileSystemDirectoryHandle> {
  let currentHandle = await navigator.storage.getDirectory();

  // Strip leading/trailing slashes and split path into segments
  const segments = dirPath.split("/").filter((s) => s.length > 0);

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment);
  }

  return currentHandle;
}


// called when user selects a history
// means we only then need to call await conn.query(`SELECT * FROM read_parquet('${fileName}')`);
export async function loadShardIntoEngine(
  dir:string,
  fileName: string,
  onLog?: (msg: string) => void
): Promise<string | null> {
  const log = (msg: string) => onLog?.(msg);
  console.log("loading shard:", fileName, ' from dir:', dir);

  try {
    const db = await getSharedDuckDBEngine();
    const dirHandle = await getSubdirectoryHandle(dir);
    // Get the actual File object from OPFS
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();

    // Registering the file makes DuckDB know it as `fileName` inside SQL
    await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, false);
    
    return fileName;
    
  } catch (err: any) {
    log(`❌ Load Mounting Error: ${err.message}`);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });

    if (!response.ok) throw new Error("Failed to compile remote scanning manifests");

    const data = await response.json();
    const rawIndexes = data.indexes || [];

    return rawIndexes.map((item: any) => {
      // Compute the standardized local OPFS name upfront
      const localFileName = buildLocalIndexFileName(
        item.tier,
        item.cube,
        item.era,
        item.version || "v1"
      );

      return {
        key: item.key || item.fileName, // R2 storage path key
        fileName: localFileName,        // Local OPFS file name
        version: item.version || "v1",
        tier: item.tier,
        era: item.era,
        cube: item.cube,
        sizeBytes: item.size,
      };
    });
  } catch (err) {
    console.error("Error pulling scanned remote catalog list:", err);
    return [];
  }
}

export interface AvailableDataShard {
  fileName: string;        // Local standardized OPFS filename (e.g., "pro_african_post_1900_v1.parquet")
  s3Key: string;           // Remote R2 Key (e.g., "data/african/era=post_1900/v1/data.parquet")
  masterCategory: string; // e.g., "african"
  era: string;            // e.g., "post_1900"
  tier: string;           // "free" | "pro"
  version: string;        // "v1"
  sizeBytes: number;
  downloadUrl?: string;   // Pre-signed URL returned from API
}

/**
 * Generates a consistent, standardized filename for local OPFS storage
 */
export function buildLocalDataShardFileName(
  tier: string,
  masterCategory: string,
  era: string,
  version: string = "v1"
): string {
  // e.g. "pro_african_post_1900_v1.parquet"
  const cleanEra = era.replace("era=", "");
  return `${tier.toLowerCase()}_${masterCategory.toLowerCase()}_${cleanEra.toLowerCase()}_${version.toLowerCase()}.parquet`;
}

/**
 * Standalone fetch function for remote data shards
 */
export async function fetchAvailableDataShards(accountId: string): Promise<AvailableDataShard[]> {
  try {
    const response = await fetch("/api/categories/list", { // Adjust endpoint URL to match your route path
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });

    if (!response.ok) {
      throw new Error("Failed to compile remote scanning manifests for data shards");
    }

    const data = await response.json();
    const rawShards = data.dataShards || [];

    return rawShards.map((item: any) => {
      // 1. Derive standardized local OPFS filename
      const localFileName = buildLocalDataShardFileName(
        item.tier,
        item.masterCategory,
        item.era,
        item.version || "v1"
      );

      return {
        fileName: localFileName,
        s3Key: item.key || item.s3Key,
        masterCategory: item.masterCategory,
        era: item.era,
        tier: item.tier,
        version: item.version || "v1",
        sizeBytes: item.sizeBytes || item.size || 0,
        downloadUrl: item.downloadUrl,
      };
    });
  } catch (err) {
    console.error("Error pulling scanned remote data shards list:", err);
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

  log(`📡 Fetching master index layer from remote storage: "${item.fileName}"...`);

  try {
    const response = await fetch("/api/aggregates/download/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        accountId,
        key: item.key, // Exact object path in R2 bucket
        cube: item.cube,
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
    await saveToOPFSFolder("indexes", item.fileName, arrayBuffer);

    log(`🟢 Successfully downloaded and saved index layer: /indexes/${item.fileName}`);

    return { success: true, targetFileName: item.fileName, };
  } catch (err: any) {
    console.error("Master index download failed:", err);
    log(`❌ Master Index Process Error: ${err.message}`);
    return { success: false, targetFileName: item.fileName, };
  }
}


//Standard Order: index__<tier>__<cube>__<era>__<version>.parquet
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
        const version = parts[4] || 'v1';
        
        const file = await handle.getFile();

        foundIndexes.push({
          key: name, // Unique string key identifier for local OPFS files
          fileName: name,
          tier,
          cube,
          era,
          version,
          sizeBytes: file.size,
          handle,
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

    const inspection = await conn.query(`
      SELECT year, typeof(year) as yr_type, category,  highest_precision
      FROM read_parquet('${fileName}') 
      LIMIT 5;
    `);
    console.log("RAW PARQUET VALUES:", inspection.toArray().map(r => r.toJSON()));

    // 🔍 1. Log incoming Parquet schema to inspect actual column names & ordering
    const schemaCheck = await conn.query(`DESCRIBE SELECT * FROM read_parquet('${fileName}');`);
    log(`📊 [${fileName}] Parquet Columns: ${schemaCheck.toArray().map((r: any) => `${r.column_name} (${r.column_type})`).join(', ')}`);

    log(`📥 Merging blocks from ${fileName}...`);

    // 🎯 2. Explicitly specify target columns on INSERT so position doesn't corrupt data
    await conn.query(`
      INSERT INTO ${INDEX_TABLE_NAME} BY NAME
      SELECT year,highest_precision,  category, event_count, uuids 
      FROM read_parquet('${fileName}', hive_partitioning = true);
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
        category VARCHAR,
        event_count BIGINT,
        highest_precision VARCHAR,
        uuids VARCHAR[]
      );
    `);

    // TRUNCATE table to wipe existing memory rows before rebuilding
    await conn.query(`TRUNCATE ${INDEX_TABLE_NAME};`);


  } catch (err: any) {
    log(`Failed to initialize table schema: ${err.message}`);
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
    log(" No local index shards found in OPFS to merge.");
    return report;
  }

  for (const index of localIndexFiles) {
    try {
      if (!index.handle) {
        log(`Skipping ${index.fileName}: Found in cache list but missing a local disk handle.`);
        report.failedFiles.push(index.fileName);
        continue;
      }
      await insertIndex(index.fileName, index.handle, onLog);
    } catch (err: any) {
      log(`Failed compiling shard: ${index.fileName}`);
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


