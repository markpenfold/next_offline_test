import * as duckdb from "@duckdb/duckdb-wasm";
import { getOPFSFileHandle } from "@/components/data/diskOPFS";
import { TimelineEvent } from "../omenland/omenTypes";


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
): Promise<string | null> {
  console.log("loadShardIntoEngine:::>", fileName)
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



export async function queryEventsByYearRangeA(
  minYear: number,
  maxYear: number,
  limit: number = 200
): Promise<TimelineEvent[]> {
  try {
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
        version
      FROM currentDataView
      WHERE year >= ${minYear} AND year <= ${maxYear}
      ORDER BY year ASC
      LIMIT ${limit};
    `;

    const result = await conn.query(sql);
    const rows = result.toArray().map((r) => r.toJSON());
    await conn.close();

    return rows.map((row: any) => ({
      _id: String(row.id || `${row.master_category || 'event'}-${row.year}-${Math.random()}`),
      subject: row.subject ?? "Unnamed event",
      description: row.description ?? "",
      master_category: row.master_category ?? "default",
      version: row.version ?? "v1",
      event_type: row.event_type ?? "general",
      tags: Array.isArray(row.tags) ? row.tags : [],
      categories: Array.isArray(row.categories) ? row.categories : [],
      text_date: row.text_date ?? undefined,
      precision: row.precision ?? undefined,
      era: row.era ?? undefined,
      location: row.location ?? undefined,
      media: row.media ?? undefined,
      date_obj: {
        year: Number(row.year),
        month: row.month !== null && row.month !== undefined ? Number(row.month) : undefined,
        day: row.day !== null && row.day !== undefined ? Number(row.day) : undefined,
        hour: row.hour !== null && row.hour !== undefined ? Number(row.hour) : undefined,
        minute: row.minute !== null && row.minute !== undefined ? Number(row.minute) : undefined,
        second: row.second !== null && row.second !== undefined ? Number(row.second) : undefined,
        millisecond: row.millisecond !== null && row.millisecond !== undefined ? Number(row.millisecond) : undefined,
      },
    }));
  } catch (err) {
    console.error("🚨 Error querying DuckDB currentDataView:", err);
    return [];
  }
}


export async function queryEventsByYearRange(
  minYear: number,
  maxYear: number,
  limit: number = 2000
): Promise<TimelineEvent[]> {
  try {
    console.log(`🔍 [DuckDB] Querying events between years ${minYear} and ${maxYear} (limit: ${limit})...`);

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
        version
      FROM currentDataView
      WHERE year >= ${minYear} AND year <= ${maxYear}
      ORDER BY year ASC
      LIMIT ${limit};
    `;

    console.log("📜 [DuckDB] Executing SQL:\n", sql);

    const result = await conn.query(sql);
    const rows = result.toArray().map((r) => r.toJSON());
    await conn.close();

    console.log(`📊 [DuckDB] Raw rows returned from query (${rows.length}):`, rows);

    const formattedEvents = rows.map((row: any) => ({
      _id: String(row.id || `${row.master_category || 'event'}-${row.year}-${Math.random()}`),
      subject: row.subject ?? "Unnamed event",
      description: row.description ?? "",
      master_category: row.master_category ?? "default",
      version: row.version ?? "v1",
      event_type: row.event_type ?? "general",
      tags: Array.isArray(row.tags) ? row.tags : [],
      categories: Array.isArray(row.categories) ? row.categories : [],
      text_date: row.text_date ?? undefined,
      precision: row.precision ?? undefined,
      era: row.era ?? undefined,
      location: row.location ?? undefined,
      media: row.media ?? undefined,
      date_obj: {
        year: Number(row.year),
        month: row.month !== null && row.month !== undefined ? Number(row.month) : undefined,
        day: row.day !== null && row.day !== undefined ? Number(row.day) : undefined,
        hour: row.hour !== null && row.hour !== undefined ? Number(row.hour) : undefined,
        minute: row.minute !== null && row.minute !== undefined ? Number(row.minute) : undefined,
        second: row.second !== null && row.second !== undefined ? Number(row.second) : undefined,
        millisecond: row.millisecond !== null && row.millisecond !== undefined ? Number(row.millisecond) : undefined,
      },
    }));

    console.log("✅ [DuckDB] Formatted TimelineEvent objects:", formattedEvents);

    return formattedEvents;
  } catch (err) {
    console.error("🚨 Error querying DuckDB currentDataView:", err);
    return [];
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
        version
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

    const formattedEvents = rows.map((row: any) => ({
      _id: String(row.id || `${row.master_category || 'event'}-${row.year}-${Math.random()}`),
      subject: row.subject ?? "Unnamed event",
      description: row.description ?? "",
      master_category: row.master_category ?? "default",
      version: row.version ?? "v1",
      event_type: row.event_type ?? "general",
      tags: Array.isArray(row.tags) ? row.tags : [],
      categories: Array.isArray(row.categories) ? row.categories : [],
      text_date: row.text_date ?? undefined,
      precision: row.precision ?? undefined,
      era: row.era ?? undefined,
      location: row.location ?? undefined,
      media: row.media ?? undefined,
      date_obj: {
        year: Number(row.year),
        month: row.month !== null && row.month !== undefined ? Number(row.month) : undefined,
        day: row.day !== null && row.day !== undefined ? Number(row.day) : undefined,
        hour: row.hour !== null && row.hour !== undefined ? Number(row.hour) : undefined,
        minute: row.minute !== null && row.minute !== undefined ? Number(row.minute) : undefined,
        second: row.second !== null && row.second !== undefined ? Number(row.second) : undefined,
        millisecond: row.millisecond !== null && row.millisecond !== undefined ? Number(row.millisecond) : undefined,
      },
    }));

    console.log("✅ [DuckDB] Formatted TimelineEvent objects:", formattedEvents);

    return formattedEvents;
  } catch (err) {
    console.error("🚨 Error querying DuckDB currentDataView:", err);
    return [];
  }
}