"use client";

import { useState, useEffect } from 'react';
import { DuckDBManager } from '@/components/data/manager';
import styles from "@/app/styles/styles.module.css";

const R2_PRO_BASE_URL = "https://pub-da55962965ef442481b26138d7c59630.r2.dev";
const R2_FREE_BASE_URL = "https://pub-ba9563169bb04753b6ccfd410a72cc4b.r2.dev";

export function SuperSimpleTestHarness() {
  const [engineStatus, setEngineStatus] = useState("Booting database...");
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [totalCacheCount, setTotalCacheCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  // 🎯 PARQUET FINDER STATES
  const [tier, setTier] = useState<'free' | 'pro'>('free');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedEra, setSelectedEra] = useState<string>('pre_1900');

  const db = DuckDBManager.getInstance();

  // Initialize DuckDB Engine
  useEffect(() => {
    db.connect((msg) => setEngineStatus(msg))
      .then(() => {
        setEngineStatus("🟢 DuckDB + OPFS Fully Armed");
        refreshGlobalCount();
      })
      .catch((err) => setEngineStatus(`🔴 Boot Fail: ${err.message}`));
  }, []);

  // 🎯 PARQUET FINDER HOOK: Re-fetch category lists whenever the target bucket Tier drops down
  useEffect(() => {
    const bucketName = tier === 'free' ? 'history-files-free' : 'history-files';
    setCategories([]);
    setSelectedCategory('');

    addLog(`Scanning bucket "${bucketName}" via Parquet Finder API...`);
    
    fetch(`/api/categories?bucket=${bucketName}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setCategories(data);
          if (data.length > 0) setSelectedCategory(data[0]);
          addLog(`Finder complete: found ${data.length} active master categories in R2 storage.`);
        } else {
          addLog(`⚠️ Finder warning: Failed parsing response structure.`);
        }
      })
      .catch(err => addLog(`❌ Finder Error: ${err.message}`));
  }, [tier]);

  const refreshGlobalCount = async () => {
    try {
      const res = await db.query("SELECT COUNT(*)::INTEGER as total FROM cached_timeline_history;");
      setTotalCacheCount(res[0]?.total ?? 0);
    } catch {
      setTotalCacheCount(0);
    }
  };

  const handleFetchCategory = async () => {
    if (!selectedCategory) return;
    setLoading(true);
    
    const baseUrl = tier === 'pro' ? R2_PRO_BASE_URL : R2_FREE_BASE_URL;
    const targetBucketPath = `master_category=${selectedCategory}/era=${selectedEra}.parquet`;
    const fullParquetUrl = `${baseUrl}/${targetBucketPath}`;
    const uniqueShardId = `${tier}_${selectedCategory}_${selectedEra}`;
    
    addLog(`Streaming from ${tier.toUpperCase()}: ${selectedCategory} (${selectedEra})...`);

    try {
      const newRowsCaptured = await db.getShard(uniqueShardId, fullParquetUrl, [0, 0]);
      addLog(`Success! Appended records into local cache: +${newRowsCaptured} rows.`);
      
      await refreshGlobalCount();

      const fetchedItems = await db.getRecordsFromShard(uniqueShardId, [0, 5]);
      setPreviewRows(fetchedItems);
      addLog(`Pulled ${fetchedItems.length} cache preview rows.`);
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
    <div style={{ maxWidth: '800px', margin: '20px auto', padding: '20px', backgroundColor: '#111', color: '#fff', borderRadius: '8px' }}>
      {/* Engine Status Block */}
      <div style={{ padding: '12px', border: '1px solid #333', borderRadius: '6px', marginBottom: '20px' }}>
        <p style={{ margin: 0, color: '#aaa' }}>System Engine Status:</p>
        <p style={{ fontWeight: 'bold', margin: '4px 0' }}>{engineStatus}</p>
        <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
          <span>Total Records Active inside Local Cache:</span>
          <span style={{ color: '#4fc3f7', fontWeight: 'bold' }}>{totalCacheCount} rows</span>
        </div>
      </div>

      {/* 🎯 THE DYNAMIC CONTROL INTERFACE */}
      <div style={{ border: '1px solid #333', padding: '16px', borderRadius: '6px', marginBottom: '20px', background: '#161616' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>📦 Dynamic R2 Dataset Ingestion</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          {/* Dropdown 1: Tier Selection */}
          <div>
            <label style={labelStyle}>Target Tier (Bucket)</label>
            <select value={tier} onChange={(e) => setTier(e.target.value as any)} style={selectStyle}>
              <option value="free">FREE Bucket (history-files-free)</option>
              <option value="pro">PRO Bucket (history-files)</option>
            </select>
          </div>

          {/* Dropdown 2: Dynamic Categories discovered by Finder */}
          <div>
            <label style={labelStyle}>Master Category</label>
            <select 
              value={selectedCategory} 
              onChange={(e) => setSelectedCategory(e.target.value)} 
              style={selectStyle}
              disabled={categories.length === 0}
            >
              {categories.length === 0 && <option>Scanning keys...</option>}
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Dropdown 3: Era Partition Selector */}
          <div>
            <label style={labelStyle}>Timeline Era</label>
            <select value={selectedEra} onChange={(e) => setSelectedEra(e.target.value)} style={selectStyle}>
              <option value="pre_1900">pre_1900</option>
              <option value="post_1900">post_1900</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleFetchCategory}
          disabled={loading || !selectedCategory}
          style={{
            width: '100%',
            padding: '12px',
            background: loading ? '#333' : '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? "Streaming Parquet via DuckDB HTTP Core..." : `⚡ Ingest master_category=${selectedCategory} into OPFS`}
        </button>
      </div>



      {/* Dynamic Data Preview Grid Block */}
      {/* Dynamic Data Preview Grid Block */}
        {previewRows.length > 0 && (
          <div style={{ marginBottom: '20px', width: '100%', clear: 'both' }}>
            <p style={{ color: '#81c784', margin: '16px 0 4px 0', fontWeight: 'bold' }}>
              ⚡ OPFS Data View (First 5 Rows of Segment):
            </p>
            <hr style={{ borderColor: '#333', marginBottom: '8px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {previewRows.map((row, idx) => {
                if (!row) return (<p>NOWT!</p>);

                return (
                  <div 
                    key={row.id ?? idx} 
                    style={{ 
                      padding: '10px', 
                      border: '1px solid #222',
                      borderRadius: '4px',
                      background: '#1a1a1a', 
                      color: '#ffffff', // 🎯 Guarantees text visibility
                      display: 'block',   // 🎯 Overrides any grid-collapsing bugs
                      visibility: 'visible'
                    }}
                  >
                    <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', color: '#fff', fontSize: '14px' }}>
                      {row.subject || "No subject"} ({row.id ?? idx})
                    </p>
                    <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: '#ccc', lineHeight: '1.4' }}>
                      {row.description || "No Description"}
                    </p>
                    <span style={{ fontSize: '11px', background: '#333', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>
                      {row.master_category || "Uncategorized"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* Logger Box */}
      <div>
        <p style={{ margin: '0 0 4px 0', color: '#aaa' }}>Live Ingestion Diagnostic Output Logs:</p>
        <div style={{ height: '150px', overflowY: 'auto', background: '#000', padding: '10px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #222' }}>
          {syncLogs.length === 0 && <p style={{ color: '#666' }}>Standby. Adjust filters above and execute fetch...</p>}
          {syncLogs.map((log, index) => (
            <p key={index} style={{ margin: '2px 0', color: log.includes('❌') ? '#ef5350' : log.includes('Success') ? '#81c784' : '#fff' }}>{log}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' };
const selectStyle = { width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' };