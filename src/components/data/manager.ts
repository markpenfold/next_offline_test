import * as duckdb from '@duckdb/duckdb-wasm';
import { DuckDBConfig } from '@/lib/utils/constants';
import { getCachedFileBlobUrl } from './cache';

export interface ShardProcessingResult {
  sourceStrategy: string;
  executionTimeMs: number;
  cacheHit: boolean;
  randomRow: any | null;
  previewRows: any[];
}

export class DuckDBManager {
  private static instance: DuckDBManager | null = null;
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;
  private initPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

  private constructor() {}

  public static getInstance(): DuckDBManager {
    if (!DuckDBManager.instance) {
      DuckDBManager.instance = new DuckDBManager();
    }
    return DuckDBManager.instance;
  }

  public async connect(onStatusChange?: (msg: string) => void): Promise<duckdb.AsyncDuckDBConnection> {
    if (this.conn) return this.conn;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      onStatusChange?.("Initializing background multi-threaded Web Workers...");
      
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }

      const localWorkerUrl = await getCachedFileBlobUrl("duckdb-worker.js", DuckDBConfig.CDN_WORKER);
      const localModuleUrl = await getCachedFileBlobUrl("duckdb-core.wasm", DuckDBConfig.CDN_MODULE);

      const logger = new duckdb.ConsoleLogger();
      const worker = new Worker(localWorkerUrl);
      
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(localModuleUrl);
      
      try {
        onStatusChange?.("Connecting to persistent local SSD database...");
        const rawPath = DuckDBConfig.DB_NAME;
        const cleanDbName = rawPath.endsWith('.db') ? rawPath : `${rawPath}.db`;

        await this.db.open({
          path: `opfs://${cleanDbName}`,
          accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
        });
        console.log(`🚀 Connected natively to persistent OPFS drive: opfs://${cleanDbName}`);
      } catch (nativeError: any) {
        console.warn("Native OPFS blocked. Falling back to temporary volatile memory...", nativeError);
        onStatusChange?.("Storage access restricted. Starting temporary session...");
        await this.db.open({
          path: ':memory:',
          accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
        });
      }

      onStatusChange?.("Optimizing database loops, mofo...");
      this.conn = await this.db.connect();
      await this.conn.query(`
        SET wal_autocheckpoint = '0KB'; 
        SET checkpoint_threshold = '0KB';`
      );

      // 🛠️ OPFS STORAGE SCHEMA
      await this.conn.query(`
        CREATE TABLE IF NOT EXISTS cached_timeline_history (
          id VARCHAR,
          subject VARCHAR,
          description VARCHAR,
          date VARCHAR,
          event_type VARCHAR,
          categories VARCHAR,        -- Will store stringified JSON
          tags VARCHAR,              -- Will store stringified JSON
          location VARCHAR,
          event_precision VARCHAR,
          media BLOB,
          master_category VARCHAR,
          source_shard VARCHAR
        );
      `);
      return this.conn;
    })();

    return this.initPromise;
  }

  public async query(sql: string): Promise<any[]> {
    if (!this.conn) throw new Error("Database connection not active.");
    const res = await this.conn.query(sql);
    return res.toArray().map((row) => row.toJSON());
  }

  /**
   * Overhauled Ingestion Engine: Drops network slicing and pulls entire modern R2 files.
   */
  public async getShard(
    shardId: string, 
    parquetUrl: string, 
    recordRange?: [number, number] // Left intact for compatibility, but ignored if [0,0]
  ): Promise<number> {
    if (!this.conn) await this.connect();
  
    let remoteSource = `read_parquet('${parquetUrl}')`;
    
    // Check if we are passing an explicit, non-zero chunk range slice limit
    if (recordRange && (recordRange[0] !== 0 || recordRange[1] !== 0)) {
      const [offset, limit] = recordRange;
      console.log(`[DuckDB] Slicing partial window: Offset ${offset}, pulling ${limit} rows.`);
      remoteSource = `(SELECT * FROM read_parquet('${parquetUrl}') LIMIT ${limit} OFFSET ${offset})`;
    } else {
      console.log(`[DuckDB] Dynamic Stream Mode: Ingesting entire targeted file asset context.`);
    }
  
    // 🎯 Use JSON_SERIALIZE on your native JSON columns (categories, tags) 
    // to cleanly convert them to stringified VARCHAR blocks in your database.
    // 🎯 We drop JSON_SERIALIZE and use explicit VARCHAR casts.
    // Core DuckDB handles this out of the box with zero extensions required!
    const incrementalSyncSql = `
      INSERT INTO cached_timeline_history
      SELECT 
        remote.id, 
        remote.subject, 
        remote.description, 
        remote.date,
        remote.event_type,
        CAST(remote.categories AS VARCHAR) as categories,   
        CAST(remote.tags AS VARCHAR) as tags,
        remote.location,
        remote.event_precision,
        remote.media,
        remote.master_category,
        '${shardId}' as source_shard
      FROM ${remoteSource} AS remote
      WHERE NOT EXISTS (
        SELECT 1 
        FROM cached_timeline_history AS local
        WHERE remote.id = local.id 
          AND local.source_shard = '${shardId}'
      );
    `;
  
    console.log(`Checking local storage map vs R2 for shard: ${shardId}...`);
    
    // Execute the insertion statement and read back how many mutations occurred
    const syncResult = await this.conn!.query(incrementalSyncSql);
    
    // In duckdb-wasm, the mutation count can be inferred via rows affected or by looking up local state adjustments
    const checkQuery = await this.query(`SELECT COUNT(*)::INTEGER as total FROM cached_timeline_history WHERE source_shard = '${shardId}';`);
    
    return checkQuery[0]?.total ?? 0;
  }

  /**
   * Overhauled Getter: Converts text-stringified columns back to rich JavaScript Objects.
   */
  public async getRecordsFromShard(
    shardId: string,
    recordRange: [number, number]
  ): Promise<any[]> {
    if (!this.conn) await this.connect();

    const [offset, limit] = recordRange;
    
    const selectSql = `
      SELECT *
      FROM cached_timeline_history
      WHERE source_shard = '${shardId}'
      ORDER BY id ASC
      LIMIT ${limit} OFFSET ${offset};
    `;

    const rawRows = await this.query(selectSql);

    // Post-processing mapping layer: parses categories and tags text blocks back to genuine JSON arrays
    return rawRows.map(row => {
      // Replace lines 189-190 inside your row mapping loop with this safer pattern:
      let parsedCategories: string[] = [];
      let parsedTags: string[] = [];

      if (row.categories) {
        try {
          parsedCategories = typeof row.categories === 'string' ? JSON.parse(row.categories) : row.categories;
        } catch (e) {
          // Fallback: If it's a pythonic list string like "['A', 'B']", clean it up manually
          parsedCategories = String(row.categories).replace(/[\[\]']/g, '').split(',').map(s => s.trim());
        }
      }

      if (row.tags) {
        try {
          parsedTags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
        } catch (e) {
          // Fallback: turns "[United Kingdom]" cleanly into ["United Kingdom"]
          parsedTags = String(row.tags).replace(/[\[\]']/g, '').split(',').map(s => s.trim());
        }
      }

      return {
        ...row,
        categories: parsedCategories,
        tags: parsedTags
      };



    });
  }

  /**
   * GETTER FUNCTION 2: Filters records based on historical date boundaries.
   * Extracts the year from your flat text 'date' column for comparison.
   * @param shardId Target shard filter
   * @param operator 'later' (>) or 'earlier' (<)
   * @param targetYear Calendar year integer (e.g., 1900)
   * @param recordRange Pagination bounds configuration [offset, limit]
   */
  public async getRecordsWithEventFilter(
    shardId: string,
    operator: 'later' | 'earlier',
    targetYear: number,
    recordRange: [number, number] = [0, 50]
  ): Promise<any[]> {
    if (!this.conn) await this.connect();

    const [offset, limit] = recordRange;
    const sqlOperator = operator === 'later' ? '>' : '<';

    // Using regexp_extract to grab the first 4-digit sequence (the year) from your text date column
    const selectSql = `
      SELECT id, subject, description, date, event_type, categories, tags, location, event_precision, media, master_category, source_shard
      FROM cached_timeline_history
      WHERE source_shard = '${shardId}'
        AND TRY_CAST(REGEXP_EXTRACT(date, '([0-9]{4})', 1) AS INTEGER) ${sqlOperator} ${targetYear}
      ORDER BY id ASC
      LIMIT ${limit} OFFSET ${offset};
    `;

    console.log(`⚡ Filtering local OPFS rows where date year is ${operator} than ${targetYear}...`);
    const rawRows = await this.query(selectSql);

    // Keep your JSON parsing post-processing clean for categories and tags arrays
    return rawRows.map(row => {
      let parsedCategories = [];
      let parsedTags = [];

      try { if (row.categories) parsedCategories = JSON.parse(row.categories); } catch (e) { console.error("Categories filter parse error:", e); }
      try { if (row.tags) parsedTags = JSON.parse(row.tags); } catch (e) { console.error("Tags filter parse error:", e); }

      return {
        ...row,
        categories: parsedCategories,
        tags: parsedTags
      };
    });
  }
}