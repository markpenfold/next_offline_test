// db/analytics.ts

import { getSharedDuckDBEngine, loadShardIntoEngine } from "./duckDATA";
import {INDEX_TABLE_NAME, TerrainTuple} from '@/components/data/dataTypes'

let sharedReadConn: any = null; // Type as duckdb.AsyncDuckDBConnection if exported

//Gets or creates a reusable connection for blazing-fast reads.*/
export async function getReadConnection() {
  if (!sharedReadConn) {
    const db = await getSharedDuckDBEngine();
    sharedReadConn = await db.connect();
  }
  return sharedReadConn;
}



export async function runQuery(sql: string) {
  try {
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
  `);

  if (error || !data) {
    return { data: [], error };
  }

  return { data, error: null };
}


export async function getDataView(loadedIndexes:string[]){
  let rtn = '';
  for(let i=0; i<loadedIndexes.length; i++ )
    rtn += ' hello';
  return rtn;
}


export async function setTerrainTable(loadedIndexes: string[]) {
  console.log("SL:KJDL:KFJ:LKDJF:LKSDJF:LKJSD:FLKJSD:FLKJD:FKJL:")
  if (!loadedIndexes || loadedIndexes.length === 0) {
    // Clear out the table if no indexes are loaded
    await runQuery(`DROP TABLE IF EXISTS master_terrain`);
    return { success: true, message: "Cleared master view" };
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
    await runQuery(sql);
    console.log("🟢 Master Terrain Table successfully compiled in DuckDB");
    // 2. 🔍 Preview top 5 rows in the console
const preview = await runQuery(`SELECT * FROM master_terrain LIMIT 5;`);

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



// analytics.ts -> getTerrainShaderMatrix
/** FOR PRECISION FIELD:
  WHEN 'year'        THEN 0
  WHEN 'month'       THEN 1
  WHEN 'day'         THEN 2
  WHEN 'hour'        THEN 3
  WHEN 'minute'      THEN 4
  WHEN 'second'      THEN 5
  WHEN 'millisecond' THEN 6
 */
export async function getTerrainShaderMatrix(): Promise<TerrainTuple[]> {
  // SQL ensures results are grouped/ordered by year and category
  const { data: results, error } = await runQuery(
    `SELECT * FROM master_terrain ORDER BY year ASC, category ASC`
  );

  if (error || !results) return [];

  // 1. Build Legend (NO SORTING - respects the SQL order)
  // Since SQL is ORDER BY category ASC, this will be naturally alphabetical,
  // but if you change SQL later, this code won't force a broken sort.
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

    // 2. Initialize the YEAR TEMPLATE
    if (!matrixMap.has(year)) {
      matrixMap.set(year, [
        year,
        allCategories, // Pointer to the ordered legend
        new Array(numCategories).fill(0),
        rank,
        new Array(numCategories).fill(null).map(() => [])
      ]);
    }

    const tuple = matrixMap.get(year)!;
    
    // Find index based on the legend (guaranteed stable now)
    const catIndex = allCategories.indexOf(category);

    // 3. Slot data
    if (catIndex !== -1) {
      tuple[2][catIndex] = count;
      tuple[4][catIndex] = uuids;
    }
    
    // 4. Update precision
    tuple[3] = Math.max(tuple[3], rank);
  }

  return Array.from(matrixMap.values()).sort((a, b) => a[0] - b[0]);
}

// 1. Each category in category_breakdown holds its own count AND uuids
export interface CategoryEntry {
  category: string;
  count: number | bigint;
  uuids: string[]; // 👈 Category-specific UUIDs
}

// 2. Updated Master Terrain Row
export interface TerrainRow {
  year: number | bigint;
  total_event_count: number | bigint;
  category_breakdown: CategoryEntry[];
  year_uuids: string[]; // 👈 All UUIDs for the entire year across categories
}


export interface TerrainFilterOptions {
  minYear?: number;
  maxYear?: number;
}

export interface FormattedTerrainStep {
  year: number;
  totalEventCount: number;
  /** Fixed-length height/banding vector strictly aligned with `categoryLegend` indices */
  vector: number[];
  /** Full category details including category-specific UUIDs */
  categoryBreakdown: CategoryEntry[];
  /** Combined list of all event UUIDs for this year across all categories */
  yearUuids: string[];
}

export interface TerrainShaderMatrixResult {
  shaderMatrix: FormattedTerrainStep[];
  /** Alphabetical list establishing index order for the shader vectors */
  categoryLegend: string[];
}
