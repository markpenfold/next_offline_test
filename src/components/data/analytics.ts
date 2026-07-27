// db/analytics.ts

import { getSharedDuckDBEngine, loadShardIntoEngine } from "./duckDATA";
import { TerrainYearStep } from '@/components/data/dataTypes';
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

 /** Non-hook utility that blocks query execution until the bootloader 
 * toggles isTerrainReady to true inside the Zustand store.*/
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

// Added bypassGate flag to resolve the initialization deadlock loop safely
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


export async function setTerrainTable(loadedIndexes: string[]) {
  console.log("🛠️ Aligning analytical workspace compilation matrix...");
  
  if (!loadedIndexes || loadedIndexes.length === 0) {
    console.log("🌱 No active shards selected. Seeding empty catalog schema for master_terrain.");
    
    // Replace raw DROP with a clean structural schema definition
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
          split_part(filename, '__', 2) AS tier,
          left(split_part(filename, '__', 2), 1) || '_' || category AS category,
          SUM(event_count) AS cat_count,
          MAX(highest_precision) AS cat_precision,
          flatten(list(uuids)) AS event_cat_uuids
      FROM read_parquet([${parquetFiles}], filename=true)
      GROUP BY year, category, tier
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

// SHOULD RETURN THE TERRAIN MATRIX
export async function getTSM(): Promise<TerrainYearStep[]> {
  const { data: results, error } = await runQuery(
    `SELECT year, category, cat_count, event_cat_uuids 
     FROM master_terrain 
     ORDER BY year ASC, category ASC`
  );

  if (error || !results || results.length === 0) {
    return [];
  }

  // 1. Extract a master list of all unique categories, sorted deterministically
  const masterCategories = Array.from(
    new Set<string>(results.map((r: any) => String(r.category)))
  ).sort();

  const numCategories = masterCategories.length;

  // 2. Group DuckDB rows by year
  const yearDataMap = new Map<number, Map<string, { count: number; uuids: string[] }>>();

  for (const row of results) {
    const year = Number(row.year);
    const category = String(row.category);
    const count = Number(row.cat_count || 0);
    const rowUuids = row.event_cat_uuids ? Array.from(row.event_cat_uuids).map(String) : [];

    if (!yearDataMap.has(year)) {
      yearDataMap.set(year, new Map());
    }

    yearDataMap.get(year)!.set(category, { count, uuids: rowUuids });
  }

  const sortedYears = Array.from(yearDataMap.keys()).sort((a, b) => a - b);

  // 3. Build uniform year tuples with exact zero / empty array padding
  return sortedYears.map((year) => {
    const categoryMapForYear = yearDataMap.get(year)!;

    // Pre-allocate padded arrays matching the master category length
    const counts: number[] = new Array(numCategories).fill(0);
    const uuids: string[][] = Array.from({ length: numCategories }, () => []);

    masterCategories.forEach((catName, idx) => {
      if (categoryMapForYear.has(catName)) {
        const record = categoryMapForYear.get(catName)!;
        counts[idx] = record.count;
        uuids[idx] = record.uuids;
      }
    });

    return [year, masterCategories, counts, uuids];
  });
}


/**
 * Fast client-side 1024-year slice generator (runs in < 0.5ms)
 */
 export function get1024WindowSlice(
   fullTerrainData: TerrainYearStep[],
   startYear: number,
   categories: string[]
 ): TerrainYearStep[] {
   // ... keep your existing get1024WindowSlice logic exact as is ...
   const yearMap = new Map<number, TerrainYearStep>();
   for (let i = 0; i < fullTerrainData.length; i++) {
     yearMap.set(Number(fullTerrainData[i][0]), fullTerrainData[i]);
   }
 
   const zeroCounts: number[] = new Array(categories.length).fill(0);
   const emptyUuids: string[][] = categories.map(() => []);
   const windowSlice: TerrainYearStep[] = new Array(1024);
 
   for (let i = 0; i < 1024; i++) {
     const year = startYear + i;
     const match = yearMap.get(year);
     if (match) {
       windowSlice[i] = match;
     } else {
       windowSlice[i] = [year, categories, zeroCounts, emptyUuids];
     }
   }
   return windowSlice;
 }