import * as duckdb from "@duckdb/duckdb-wasm";
import {getSubdirectoryHandle, getLocalOPFSIndexes} from '@/components/data/diskOPFS'



// 🔒 THE CONCURRENCY LOCKS
let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let isIndexLoading = false;

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

export async function loadShardIntoEngine(
  dir: string,
  fileName: string,
  fileHandle?: FileSystemFileHandle, // ✨ New optional parameter
  onLog?: (msg: string) => void
): Promise<string | null> {
  const log = (msg: string) => onLog?.(msg);
  console.log("Loading shard:", fileName, 'from dir:', dir);

  try {
    const db = await getSharedDuckDBEngine();
    
    let handleToMount = fileHandle;

    // Fallback: If no handle was provided, do the manual disk lookup
    if (!handleToMount) {
      const dirHandle = await getSubdirectoryHandle(dir);
      handleToMount = await dirHandle.getFileHandle(fileName);
    }

    // Extract the raw File object from the handle
    const file = await handleToMount.getFile();

    // Registering the file makes DuckDB know it as `fileName` inside SQL
    await db.registerFileHandle(
      fileName, 
      file, 
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, 
      false
    );
    
    return fileName;
    
  } catch (err: any) {
    log(`❌ Load Mounting Error: ${err.message}`);
    console.error(err);
    return null;
  }
}

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

export function buildLocalIndexFileName(
  tier: string,
  category: string,
  version: string = "v1"
): string {
  const cleanVersion = version || "v1";
  return `index__${tier}__${category}__${cleanVersion}.parquet`;
}


export async function rebuildDataView(activeFiles: string[]): Promise<boolean> {
  try {
    const db = await getSharedDuckDBEngine();
    const conn = await db.connect();

    // If the user removed everything, drop the view and exit
    if (activeFiles.length === 0) {
      await conn.query(`DROP VIEW IF EXISTS currentDataView;`);
      await conn.close();
      return true;
    }

    // Build the SQL: SELECT * FROM 'file1.parquet' UNION ALL SELECT * FROM 'file2.parquet'
    const selectStatements = activeFiles.map(fileName => `SELECT * FROM '${fileName}'`);
    const unionQuery = selectStatements.join('\nUNION ALL\n');

    // CREATE OR REPLACE VIEW instantly updates the pointer
    await conn.query(`CREATE OR REPLACE VIEW currentDataView AS \n${unionQuery}`);
    
    await conn.close();
    return true;
  } catch (error) {
    console.error("🚨 Failed to rebuild currentDataView in DuckDB:", error);
    return false;
  }
}