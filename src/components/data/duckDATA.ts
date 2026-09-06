import * as duckdb from "@duckdb/duckdb-wasm";
import { getOPFSFileHandle } from "@/components/data/diskOPFS";
import { TimelineEvent } from "../omenland/omenTypes";
import { 
  getDirectory, 
  saveToOPFSFolder, 
  deleteOPFSFile, 
  getOPFSEntries 
} from '@/components/data/diskOPFS'; // Adjust path if necessary

// Module-level singleton handles
let dbInstance: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

const DATABASE_DIR = 'database';

/**
 * Safely resolves installed DuckDB package version.
 */
function getDuckDBVersion(): string {
  const version = (duckdb as { PACKAGE_VERSION?: string }).PACKAGE_VERSION;
  return version || process.env.NEXT_PUBLIC_DUCKDB_VERSION || '1.28.0';
}

/**
 * 1. Resolves optimal bundle based on browser capabilities.
 * Enforces selection of the EH (Enhanced) bundle containing native Parquet support.
 */
export async function resolveDuckDBBundle(): Promise<duckdb.DuckDBBundle> {
  const DUCKDB_BUNDLES = duckdb.getJsDelivrBundles();

  // Try resolving bundle through DuckDB's selector
  const selected = await duckdb.selectBundle({
    mvp: DUCKDB_BUNDLES.mvp,
    eh: DUCKDB_BUNDLES.eh,
  });

  // Fall back to EH bundle explicitly if selected is undefined or mapped to MVP
  const bundle = selected && selected.mainModule.includes('duckdb-eh')
    ? selected
    : DUCKDB_BUNDLES.eh;

  if (!bundle) {
    throw new Error('Failed to resolve DuckDB WASM EH bundle.');
  }

  return bundle as duckdb.DuckDBBundle;
}






/**
 * 2. Caches and retrieves WASM binary from OPFS database/ directory.
 * Uses typed slices directly to avoid main-thread ArrayBuffer copy overhead.
 */
async function getOrUpdateWasmFromOPFS(wasmUrl: string): Promise<string> {
  const version = getDuckDBVersion();
  const fileName = wasmUrl.split('/').pop() || 'duckdb.wasm';
  const targetFileName = `${fileName}-v${version}`;

  const dbDirHandle = await getDirectory(DATABASE_DIR);

  // A. Cache Hit Check
  try {
    const fileHandle = await dbDirHandle.getFileHandle(targetFileName, { create: false });
    const file = await fileHandle.getFile();

    if (file.size === 0) {
      console.warn(`⚠️ Corrupt 0-byte WASM detected at /${DATABASE_DIR}/${targetFileName}. Deleting...`);
      await deleteOPFSFile(DATABASE_DIR, targetFileName);
      throw new DOMException('Corrupt file', 'NotFoundError');
    }

    console.log(`⚡ DuckDB WASM loaded from OPFS (/${DATABASE_DIR}/${targetFileName}, ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    const typedFile = file.slice(0, file.size, 'application/wasm');
    return URL.createObjectURL(typedFile);
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      console.log(`ℹ️ Cache miss for /${DATABASE_DIR}/${targetFileName}. Downloading from CDN...`);
    } else {
      console.warn(`⚠️ OPFS access failed for /${DATABASE_DIR}/${targetFileName}:`, err);
    }
  }

  // B. Purge Stale WASM Versions
  try {
    const entries = await getOPFSEntries(DATABASE_DIR);
    for (const { name } of entries) {
      if (name.startsWith(`${fileName}-v`) && name !== targetFileName) {
        await deleteOPFSFile(DATABASE_DIR, name);
      }
    }
  } catch (err) {
    console.warn(`Could not purge old WASM files in /${DATABASE_DIR}:`, err);
  }

  // C. Download & Persist
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch DuckDB WASM binary: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();

  await saveToOPFSFolder(DATABASE_DIR, targetFileName, arrayBuffer);

  const wasmBlob = new Blob([arrayBuffer], { type: 'application/wasm' });
  return URL.createObjectURL(wasmBlob);
}

/**
 * 3. Creates worker instance from script text to bypass origin restrictions.
 */
async function createWorkerFromScript(workerUrl: string): Promise<{ worker: Worker; workerBlobURL: string }> {
  const response = await fetch(workerUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch DuckDB worker script: ${response.statusText}`);
  }

  const workerCode = await response.text();
  const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
  const workerBlobURL = URL.createObjectURL(workerBlob);

  return {
    worker: new Worker(workerBlobURL),
    workerBlobURL,
  };
}


/**
 * Instantiates the engine and side-loads the Parquet extension from local OPFS memory.
 */
async function instantiateEngine(
  bundle: duckdb.DuckDBBundle,
  cachedWasmUrl: string
): Promise<duckdb.AsyncDuckDB> {
  const { worker, workerBlobURL } = await createWorkerFromScript(bundle.mainWorker!);

  try {
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(cachedWasmUrl, bundle.pthreadWorker);

    const conn = await db.connect();
    await conn.query(`SET autoinstall_known_extensions = false;`);
    await conn.query(`SET autoload_known_extensions = false;`);
    await conn.query(`LOAD parquet;`);   // <-- the actual missing piece
    await conn.close();

    return db;
  } finally {
    URL.revokeObjectURL(workerBlobURL);
  }
}
/**
 * Main Orchestrator: Coalesces concurrent boot requests into a single singleton thread.
 */
async function ensureExtensionServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return; // unsupported browser: LOAD just hits the network directly
  await navigator.serviceWorker.register('/duckdb-sw.js');
  await navigator.serviceWorker.ready;
}

export async function getSharedDuckDBEngine(): Promise<duckdb.AsyncDuckDB> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await ensureExtensionServiceWorker();           // <-- new, must come first
      const bundle = await resolveDuckDBBundle();
      const cachedWasmUrl = await getOrUpdateWasmFromOPFS(bundle.mainModule);

      dbInstance = await instantiateEngine(bundle, cachedWasmUrl);
      return dbInstance;
    } catch (error) {
      initPromise = null;
      throw error;
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
): Promise<string | null> {
  //console.log("loadShardIntoEngine:::>", fileName)
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
    console.log(`❌ Load Mounting Error: ${err.message}`);
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

    const selectStatements = activeFiles.map(fileName => `SELECT *, '${fileName}' AS file_name FROM '${fileName}'`);
    const unionQuery = selectStatements.join('\nUNION ALL\n');

    await conn.query(`CREATE OR REPLACE VIEW currentDataView AS \n${unionQuery}`);
    
    await conn.close();
    return true;
  } catch (error) {
    console.error("🚨 Failed to rebuild currentDataView in DuckDB:", error);
    return false;
  }
}



export async function queryEventsByYear(
  year: number,
  limit: number = 2000
): Promise<TimelineEvent[]> {
  try {
    console.log(`🔍 [DuckDB] Querying events for year ${year} (limit: ${limit})...`);

    const db = await getSharedDuckDBEngine();
    const conn = await db.connect();

    // Verify currentDataView existence
    const checkView = await conn.query(`
      SELECT count(*) as count 
      FROM information_schema.tables 
      WHERE table_name = 'currentDataView';
    `);

    const viewExists = checkView.toArray()[0]?.toJSON().count > 0;
    if (!viewExists) {
      console.warn("⚠️ [DuckDB] 'currentDataView' does not exist yet. Returning empty array.");
      await conn.close();
      return [];
    }

    const sql = `
      SELECT 
        id,
        year,
        subject,
        description,
        categories,
        tags,
        date AS text_date,
        precision,
        event_type,
        media,
        location,
        month,
        day,
        hour,
        minute,
        second,
        millisecond,
        era,
        master_category,
        version,
        file_name
      FROM currentDataView
      WHERE year = ${year}
      ORDER BY year ASC
      LIMIT ${limit};
    `;

    console.log("📜 [DuckDB] Executing SQL:\n", sql);

    const result = await conn.query(sql);
    const rows = result.toArray().map((r) => r.toJSON());
    await conn.close();

    console.log(`📊 [DuckDB] Raw rows returned from query (${rows.length}):`, rows);

    const formattedEvents: TimelineEvent[] = rows.map((row: any) => ({
      _id: String(row.id || `${row.master_category || 'event'}-${row.year}-${Math.random()}`),
      subject: row.subject ?? "Unnamed event",
      description: row.description ?? "",
      master_category: row.master_category ?? "default",
      fileName: row.file_name ?? "",
      version: row.version ?? undefined,
      event_type: row.event_type ?? undefined,
      tags: Array.isArray(row.tags) ? row.tags : [],
      categories: Array.isArray(row.categories) ? row.categories : [],
      text_date: row.text_date ?? undefined,
      precision: row.precision ?? undefined,
      era: row.era ?? undefined,
      location: row.location != null ? Number(row.location) : undefined,
      media: row.media != null ? Number(row.media) : undefined,

      // Flat Temporal Properties (matching updated TimelineEvent schema)
      year: Number(row.year),
      month: row.month != null ? Number(row.month) : undefined,
      day: row.day != null ? Number(row.day) : undefined,
      hour: row.hour != null ? Number(row.hour) : undefined,
      minutes: row.minute != null ? Number(row.minute) : undefined,
      seconds: row.second != null ? Number(row.second) : undefined,
      miliseconds: row.millisecond != null ? Number(row.millisecond) : undefined,
    }));

    console.log("✅ [DuckDB] Formatted TimelineEvent objects:", formattedEvents);

    return formattedEvents;
  } catch (err) {
    console.error("🚨 Error querying DuckDB currentDataView:", err);
    return [];
  }
}