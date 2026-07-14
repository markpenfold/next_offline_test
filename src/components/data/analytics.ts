// db/analytics.ts
import { getSharedDuckDBEngine } from "./storage";
import {INDEX_TABLE_NAME} from './storage'

let sharedReadConn: any = null; // Type as duckdb.AsyncDuckDBConnection if exported

console.log(INDEX_TABLE_NAME)

//Gets or creates a reusable connection for blazing-fast reads.*/
export async function getReadConnection() {
  if (!sharedReadConn) {
    const db = await getSharedDuckDBEngine();
    sharedReadConn = await db.connect();
  }
  return sharedReadConn;
}

/**
 * A generic wrapper to run queries and return clean JS objects.
 */
/**
 * A guarded generic wrapper to run queries safely.
 * Always returns an object with { data, error }.
 */
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