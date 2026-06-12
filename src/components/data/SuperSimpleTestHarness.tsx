"use client";

import { useState, useEffect } from 'react';
import { DuckDBManager } from '@/components/data/manager';

const TEST_SHARD_URL = "https://pub-da55962965ef442481b26138d7c59630.r2.dev/shard_0.parquet";
const SHARD_ID = "shard_0";

export function SuperSimpleTestHarness() {
  const [engineStatus, setEngineStatus] = useState("Booting database...");
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [totalCacheCount, setTotalCacheCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // Added state to display rows pulled back from our new range functions
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  const db = DuckDBManager.getInstance();

  // Boot up the database context instantly on page-load
  useEffect(() => {
    db.connect((msg) => setEngineStatus(msg))
      .then(() => {
        setEngineStatus("🟢 DuckDB + OPFS Fully Armed");
        refreshGlobalCount();
      })
      .catch((err) => setEngineStatus(`🔴 Boot Fail: ${err.message}`));
  }, []);

  const refreshGlobalCount = async () => {
    try {
      const res = await db.query("SELECT COUNT(*)::INTEGER as total FROM cached_timeline_history;");
      setTotalCacheCount(res[0]?.total ?? 0);
    } catch {
      setTotalCacheCount(0);
    }
  };

  const handleSyncSegment = async (segment: 'first' | 'second') => {
    setLoading(true);
    
    // 🎯 Determine [offset, limit] parameters based on selection choice
    // first half = rows 1-1000 (Offset 0, Pull 1000)
    // second half = rows 1001-2000 (Offset 1000, Pull 1000)
    const range: [number, number] = segment === 'first' ? [0, 1000] : [1000, 1000];
    const rangeLabel = segment === 'first' ? "Rows 1-1000" : "Rows 1001-2000";
    
    addLog(`Initiating incremental R2 stream request for ${rangeLabel}...`);

    try {
      // 1. Execute the incremental fetch routine from the Parquet cloud file
      const newRowsCaptured = await db.getShard(SHARD_ID, TEST_SHARD_URL, range);
      addLog(`Success! Net newly appended records into OPFS cache: +${newRowsCaptured} rows.`);
      
      // 2. Instantly update the counter
      await refreshGlobalCount();

      // 3. Let's pull a preview page of 5 items using our new getRecordsFromShard method 
      // to prove data is moving down cleanly into our OPFS structured schema
      const fetchedItems = await db.getRecordsFromShard(SHARD_ID, [segment === 'first' ? 0 : 1000, 5]);
      setPreviewRows(fetchedItems);
      addLog(`Pulled ${fetchedItems.length} local cache rows for screen display preview.`);

    } catch (err: any) {
      addLog(`❌ Error streaming segment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addLog = (msg: string) => {
    setSyncLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  return (
    <div className="p-8 max-w-xl mx-auto space-y-6 font-mono text-xs">
      {/* Engine Status Block */}
      <div className="p-4 bg-gray-900 text-green-400 rounded border border-gray-800 shadow-md">
        <p className="font-bold text-sm mb-1">System Engine Status:</p>
        <p>{engineStatus}</p>
        <div className="mt-3 pt-2 border-t border-gray-800 flex justify-between">
          <span>Total Records Active inside Local Cache:</span>
          <span className="text-white font-bold text-sm">{totalCacheCount} rows</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleSyncSegment('first')}
          disabled={loading}
          className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold shadow disabled:bg-gray-300 transition text-left"
        >
          Button 0 <br /> 
          <span className="font-normal text-[10px] opacity-80">Sync Rows: 1 - 1,000</span>
        </button>

        <button
          onClick={() => handleSyncSegment('second')}
          disabled={loading}
          className="p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold shadow disabled:bg-gray-300 transition text-left"
        >
          Button 1 <br /> 
          <span className="font-normal text-[10px] opacity-80">Sync Rows: 1,001 - 2,000</span>
        </button>
      </div>

      {/* Dynamic Data Preview Grid Block */}
      {previewRows.length > 0 && (
        <div className="p-4 border rounded-md bg-white shadow-sm space-y-2">
          <p className="font-bold text-gray-800 border-b pb-1">⚡ OPFS Data View (First 5 Rows of Segment):</p>
          <div className="space-y-3">
            {previewRows.map((row) => (
              <div key={row.id} className="p-2 bg-gray-50 rounded border border-gray-100">
                <p className="font-bold text-blue-700">{row.label} ({row.id})</p>
                <p className="text-gray-500 italic mt-0.5">{row.description}</p>
                {row.core?.occupation && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    💼 Occupations: {row.core.occupation.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logger Box */}
      <div className="space-y-2">
        <p className="font-bold text-gray-700">Live Ingestion Diagnostic Output Logs:</p>
        <div className="h-41 border rounded bg-gray-50 p-3 overflow-y-auto space-y-1 text-gray-600 border-gray-200">
          {syncLogs.length === 0 && <p className="text-gray-400 italic">Standby. Click a segment target above to fire pipeline...</p>}
          {syncLogs.map((log, index) => (
            <p key={index} className="leading-relaxed border-b border-gray-100 pb-1 last:border-0">{log}</p>
          ))}
        </div>
      </div>
    </div>
  );
}