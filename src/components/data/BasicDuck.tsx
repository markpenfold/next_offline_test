"use client";

import { useState, useEffect, useRef } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { getDuckDBInstance } from './duckInstance';

const DB_FILE_NAME = "history_app_cache.db";

export default function BasicDuck() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  
  // Use a ref to keep hold of our running DuckDB instance across user clicks
  const dbRef = useRef<duckdb.AsyncDuckDB | null>(null);

  const addLog = (msg: string) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p]);

  // 1. Initialize DuckDB once when the client mounts
  useEffect(() => {
    async function init() {
      addLog("Initializing browser DuckDB instance...");
      try {
        dbRef.current = await getDuckDBInstance();
        addLog("🟢 DuckDB Core Ready in browser worker!");
      } catch (err: any) {
        addLog(`❌ Initialization Failed: ${err.message}`);
      }
    }
    init();

    // Cleanup instance when navigating away
    return () => {
      if (dbRef.current) {
        dbRef.current.terminate();
      }
    };
  }, []);

  
  // --- 2. FETCH FROM R2, STREAM THROUGH DUCKDB, AND MERGE INCREMENTALLY INTO OPFS ---
  const handleSyncShard = async (shardPath: string) => {
    if (!dbRef.current) return addLog("❌ DB not initialized yet");
    setLoading(true);
    addLog(`Fetching shard: ${shardPath}...`);

    let conn;
    const tempName = "temp_shard.parquet";

    try {
      let activeBucket = 'history-files';
      const db = dbRef.current;
      conn = await db.connect();
      const root = await navigator.storage.getDirectory();
      
      // Construct the proper nested file path required by your R2 bucket layout
      const targetFile = `master_category=${shardPath}/era=post_1900.parquet`;
      const url = `/api/download?bucket=${activeBucket}&file=${encodeURIComponent(targetFile)}`;
      
      // Download the Parquet binary over our Next.js API proxy route
      const response = await fetch(url);      
      if (!response.ok) throw new Error(`Proxy download failed with status: ${response.status}`);
      const blob = await response.blob();

      // Register the transient downloaded file into DuckDB's Virtual Filesystem (VFS)
      await db.registerFileHandle(tempName, blob, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, false);

      // Verify if our local persistent db file exists and contains data inside OPFS
      let dbExists = false;
      try {
        const checkHandle = await root.getFileHandle(DB_FILE_NAME);
        const fileData = await checkHandle.getFile();
        
        // Ensure it's a valid, populated file, not a corrupted 0-byte ghost file
        if (fileData.size > 0) {
          await db.registerFileHandle(DB_FILE_NAME, fileData, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, false);
          dbExists = true;
        }
      } catch {
        dbExists = false;
      }

      // 🧹 SESSION SANITIZATION: Force drop any lingering alias from a previous click
      try {
        await conn.query("DETACH persistent_db;");
      } catch {
        // Alias was already clear, proceed smoothly
      }

      // Attach the appropriate workspace target configuration
      if (dbExists) {
        await conn.query(`ATTACH '${DB_FILE_NAME}' AS persistent_db`);
      } else {
        // If the file doesn't exist yet, attach a memory workspace to prevent WebAssembly .wal logs panic
        await conn.query(`ATTACH ':memory:' AS persistent_db`);
      }

      // Initialize destination aggregate table schema if it's the first execution pass
      await conn.query(`
        CREATE TABLE IF NOT EXISTS persistent_db.history_records AS 
        SELECT * FROM '${tempName}' WHERE 1=0
      `);

      // INCREMENTAL SYNC: Merge records tracking distinct item updates to avoid duplicates
      addLog("Merging shard data incrementally...");
      await conn.query(`
        INSERT INTO persistent_db.history_records 
        SELECT * FROM '${tempName}'
        WHERE id NOT IN (SELECT id FROM persistent_db.history_records)
      `);

      addLog("Saving updated database compilation to local OPFS cache...");
      
      // Extract the compiled database buffer out of DuckDB's virtual filesystem mapping
      const buffer = await db.copyFileToBuffer(dbExists ? DB_FILE_NAME : 'persistent_db');
      
      // Detach the dataset safely to release standard operational thread locks
      try {
        await conn.query("DETACH persistent_db;");
      } catch {}

      // Write the binary array safely into the physical OPFS file system layer
      const fileHandle = await root.getFileHandle(DB_FILE_NAME, { create: true });
      const writable = await fileHandle.createWritable();
      
      // 💡 TS FIX: Wrap your SharedArrayBuffer inside a fresh traditional Uint8Array view
      await writable.write(new Uint8Array(buffer));
      await writable.close();

      // Clean up session allocations to prevent leakage on next selection click
      try {
        await db.dropFile(tempName);
      } catch {}
      
      if (dbExists) {
        try {
          await db.dropFile(DB_FILE_NAME);
        } catch {}
      }

      addLog(`🟢 Incremental sync successful for ${shardPath}!`);
    } catch (err: any) {
      addLog(`❌ Sync Error: ${err.message}`);
      console.error("Operational crash trace context:", err);
    } finally {
      if (conn) {
        try {
          await conn.close();
        } catch {}
      }
      setLoading(false);
    }
  };

  // 3. Retrieve and query the data straight from OPFS
  const handleQueryLocalData = async () => {
    if (!dbRef.current) return addLog("❌ DB not initialized yet");
    setLoading(true);
    addLog("Reading local data collection out of OPFS...");

    try {
      const db = dbRef.current;
      const conn = await db.connect();
      const root = await navigator.storage.getDirectory();

      // Mount the persistent DB file out of OPFS storage
      const fileHandle = await root.getFileHandle(DB_FILE_NAME);
      const fileData = await fileHandle.getFile();
      await db.registerFileHandle(DB_FILE_NAME, fileData, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, false);

      await conn.query(`ATTACH '${DB_FILE_NAME}' AS local_db`);
      
      const result = await conn.query(`SELECT * FROM local_db.history_records LIMIT 5`);
      setRows(result.toArray().map(r => r.toJSON()));

      await conn.query("DETACH local_db");
      await conn.close();
      addLog("🟢 Data queried successfully!");
    } catch (err: any) {
      addLog(`❌ Query Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', background: '#111', color: '#fff' }}>
      <h3>DuckDB Operational Center</h3>
      
      <div style={{ display: 'flex', gap: '10px', margin: '20px 0' }}>
        <button disabled={loading} onClick={() => handleSyncShard('hitler')}>
          Sync Hitler Pre-1900 Shard
        </button>
        <button disabled={loading} onClick={() => handleSyncShard('intelligence_agencies')}>
          Sync intelligence_agencies Pre-1900 Shard
        </button>
        <button disabled={loading} onClick={handleQueryLocalData} style={{ background: 'green', color: 'white' }}>
          Query OPFS Compound DB
        </button>
      </div>

      {/* Render matching row previews or diagnostic logging panel view components */}
    </div>
  );
}