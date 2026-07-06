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
export async function runQuery(sql: string) {
  const conn = await getReadConnection();
  const result = await conn.query(sql);
  
  // .toArray() converts the Arrow IPC format into standard JS arrays of objects.
  // DuckDB does this incredibly fast via zero-copy memory sharing!
  return result.toArray(); 
}