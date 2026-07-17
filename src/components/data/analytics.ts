// db/analytics.ts

import { getSharedDuckDBEngine, loadShardIntoEngine } from "./duckDATA";
import { INDEX_TABLE_NAME, TerrainTuple } from '@/components/data/dataTypes';
import { useDATAStore } from '@/stores/useDataStore'; // Ensure path matches your project structure

let sharedReadConn: any = null; // Type as duckdb.AsyncDuckDBConnection if exported

// Gets or creates a reusable connection for blazing-fast reads.
export async function getReadConnection() {
  if (!sharedReadConn) {
    const db = await getSharedDuckDBEngine();
    sharedReadConn = await db.connect();
  }
  return sharedReadConn;
}

/**
 * Non-hook utility that blocks query execution until the bootloader 
 * toggles isTerrainReady to true inside the Zustand store.
 */
async function awaitEngineTableReady(): Promise<void> {
  // 1. If the bootloader already finished compiling the layout, pass through instantly
  if (useDATAStore.getState().isTerrainReady) {
    return;
  }

  // 2. Otherwise, hold execution and subscribe to state modifications
  return new Promise<void>((resolve) => {
    const unsub = useDATAStore.subscribe((state) => {
      if (state.isTerrainReady) {
        unsub(); // Clean up listener memory instantly
        resolve(); // Release the blocked query
      }
    });
  });
}

// 🔥 Added bypassGate flag to resolve the initialization deadlock loop safely
export async function runQuery(sql: string, bypassGate = false) {
  try {
    // UI components pass through here and wait. setTerrainTable skips this check entirely.
    if (!bypassGate) {
      await awaitEngineTableReady();
    }

    const conn = await getReadConnection();
    const result = await conn.query(sql);
    
    return { 
      data: result.toArray(), 
      error: null 
    };
  } catch (err: any) {
    // Log the exact SQL that failed for easy debugging
    console.error(`🦆 DuckDB Query Error: ${err.message}\nSQL: ${sql}`);
    
    return { 
      data: [], // Always return an array so .map() in UI doesn't crash
      error: err.message 
    };
  }
}

export async function getIndex(limit: number = 100) {
  // 🎯 Cast BIGINT year to INTEGER in SQL so Arrow serializes standard JS numbers
  const { data, error } = await runQuery(`
    SELECT 
      CAST(year AS BIGINT) AS year, 
      category, 
      CAST(event_count AS INTEGER) AS event_count, 
      highest_precision,
      uuids 
    FROM ${INDEX_TABLE_NAME} 
    LIMIT ${limit};
  `); // Inherits bypassGate = false (Waits for boot)

  if (error || !data) {
    return { data: [], error };
  }

  return { data, error: null };
}

export async function getDataView(loadedIndexes: string[]) {
  let rtn = '';
  for (let i = 0; i < loadedIndexes.length; i++)
    rtn += ' hello';
  return rtn;
}

export async function setTerrainTable(loadedIndexes: string[]) {
  console.log("🛠️ Aligning analytical workspace compilation matrix...");
  
  if (!loadedIndexes || loadedIndexes.length === 0) {
    console.log("🌱 No active shards selected. Seeding empty catalog schema for master_terrain.");
    
    // ✅ FIX: Replace raw DROP with a clean structural schema definition
    await runQuery(`
      CREATE OR REPLACE TABLE master_terrain (
        year BIGINT,
        category VARCHAR,
        cat_count BIGINT,
        cat_precision INTEGER,
        precision_rank INTEGER,
        event_cat_uuids VARCHAR[],
        cat_uuids VARCHAR[]
      );
    `, true);
    
    return { success: true, message: "Materialized empty master view schema shell" };
  }

  // 🛡️ Guard: Ensure every index in state is registered in DuckDB VFS
  for (const fileName of loadedIndexes) {
    await loadShardIntoEngine('indexes', fileName);
  }
  console.log("LOADED INDEXES In syncTerrainTable:", loadedIndexes);

  const parquetFiles = loadedIndexes.map(f => `'${f}'`).join(', ');

  // Creates a highly optimized, pre-aggregated table in DuckDB memory
  const sql = `
  CREATE OR REPLACE TABLE master_terrain AS 
  SELECT 
      year, 
      category, 
      SUM(event_count) AS cat_count,
      MAX(highest_precision) AS cat_precision,
      flatten(list(uuids)) AS event_cat_uuids
  FROM read_parquet([${parquetFiles}])
  GROUP BY year, category
  ORDER BY year ASC, category ASC;
`;

  try {
    await runQuery(sql, true);
    console.log("🟢 Master Terrain Table successfully compiled in DuckDB");
    
    // 2. 🔍 Preview top 5 rows in the console
    const preview = await runQuery(`SELECT * FROM master_terrain LIMIT 5;`, true);

    if (preview.data) {
      console.log("📊 master_terrain Preview (Top 5 Rows):");
      console.table(
        preview.data.map((row: any) => ({
          year: row.year,
          category: row.category,
          count: row.cat_count,
          precision_rank: row.cat_precision,
          uuid_count: row.event_cat_uuids ? row.event_cat_uuids.length : 0
        }))
      );
    }

    return { success: true };
  } catch (error) {
    console.error("❌ Failed to compile master terrain table:", error);
    return { success: false, error };
  }
}

export async function getTerrainShaderMatrix(): Promise<TerrainTuple[]> {
  // SQL ensures results are grouped/ordered by year and category
  // Inherits bypassGate = false (Safely stalls DataView components during active booting sequences)
  const { data: results, error } = await runQuery(
    `SELECT * FROM master_terrain ORDER BY year ASC, category ASC`
  );

  if (error || !results) return [];

  const allCategories = Array.from(
    new Set<string>(results.map((r: any) => String(r.category)))
  );

  const numCategories = allCategories.length;
  const matrixMap = new Map<number, TerrainTuple>();

  for (const row of results) {
    const year = Number(row.year);
    const category = String(row.category);
    const count = Number(row.cat_count);
    const rank = Number(row.precision_rank);
    const uuids = row.cat_uuids ? Array.from(row.cat_uuids).map(String) : [];

    if (!matrixMap.has(year)) {
      matrixMap.set(year, [
        year,
        allCategories, 
        new Array(numCategories).fill(0),
        rank,
        new Array(numCategories).fill(null).map(() => [])
      ]);
    }

    const tuple = matrixMap.get(year)!;
    const catIndex = allCategories.indexOf(category);

    if (catIndex !== -1) {
      tuple[2][catIndex] = count;
      tuple[4][catIndex] = uuids;
    }
    
    tuple[3] = Math.max(tuple[3], rank);
  }

  return Array.from(matrixMap.values()).sort((a, b) => a[0] - b[0]);
}

// Interface structures remain unchanged below...
export interface CategoryEntry {
  category: string;
  count: number | bigint;
  uuids: string[];
}

export interface TerrainRow {
  year: number | bigint;
  total_event_count: number | bigint;
  category_breakdown: CategoryEntry[];
  year_uuids: string[];
}

export interface TerrainFilterOptions {
  minYear?: number;
  maxYear?: number;
}

export interface FormattedTerrainStep {
  year: number;
  totalEventCount: number;
  vector: number[];
  categoryBreakdown: CategoryEntry[];
  yearUuids: string[];
}

export interface TerrainShaderMatrixResult {
  shaderMatrix: FormattedTerrainStep[];
  categoryLegend: string[];
}