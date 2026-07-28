import * as duckdb from "@duckdb/duckdb-wasm";
import { getOPFSFileHandle } from "@/components/data/diskOPFS";

// 🔒 THE CONCURRENCY LOCKS
let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/**
 * Coalesces concurrent boot requests into a single shared execution thread.
 */
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
      initPromise = null;
      throw error;
    } finally {
      if (blobURL) {
        URL.revokeObjectURL(blobURL);
      }
    }
  })();

  return initPromise;
}

/**
 * Mounts an OPFS Parquet file handle directly into DuckDB's virtual filesystem (VFS)
 */
export async function loadShardIntoEngine(
  dir: string,
  fileName: string,
  fileHandle?: FileSystemFileHandle,
  onLog?: (msg: string) => void
): Promise<string | null> {
  const log = (msg: string) => onLog?.(msg);

  try {
    const db = await getSharedDuckDBEngine();
    
    let handleToMount = fileHandle;

    // Fallback: Fetch file handle from disk using updated diskOPFS helper
    if (!handleToMount) {
      handleToMount = (await getOPFSFileHandle(dir, fileName)) || undefined;
    }

    if (!handleToMount) {
      throw new Error(`Could not locate handle for /${dir}/${fileName}`);
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

/**
 * Drops a mounted file handle from DuckDB's VFS to free up worker memory
 */
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

/**
 * Rebuilds the unified DuckDB SQL view `currentDataView` across all active files
 */
export async function rebuildDataView(activeFiles: string[]): Promise<boolean> {
  try {
    const db = await getSharedDuckDBEngine();
    const conn = await db.connect();

    if (activeFiles.length === 0) {
      await conn.query(`DROP VIEW IF EXISTS currentDataView;`);
      await conn.close();
      return true;
    }

    const selectStatements = activeFiles.map(fileName => `SELECT * FROM '${fileName}'`);
    const unionQuery = selectStatements.join('\nUNION ALL\n');

    await conn.query(`CREATE OR REPLACE VIEW currentDataView AS \n${unionQuery}`);
    
    await conn.close();
    return true;
  } catch (error) {
    console.error("🚨 Failed to rebuild currentDataView in DuckDB:", error);
    return false;
  }
}