// 📄 src/app/dashboard/page.tsx
'use client'

import { useEffect, useState } from "react";
import { AppStoreProvider, useAppStore } from "@/app/providers/AppStoreProvider";

function SandboxWorkspace() {
  const isOnline = useAppStore((s) => s.isOnline);
  const tier = useAppStore((s) => s.tier);
  const checkNetwork = useAppStore((s) => s.checkNetwork);
  const toggleTier = useAppStore((s) => s.toggleTier);

  const [blocks, setBlocks] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    checkNetwork();
  }, [checkNetwork]);

  // This is used strictly for styling the UI elements on render
  const hasAccessCurrently = isOnline || tier === 'pro';

  // Button 1 Handler
  const handleCheckNetwork = async () => {
    setChecking(true);
    await checkNetwork();
    setChecking(false);
  };

  // ⚡ Button 3 Handler (Now triggers live check)
  const addBlock = async () => {
    setChecking(true);
    
    // 1. Force a live ping to Google/Apple right now
    const freshOnlineStatus = await checkNetwork(); 
    
    setChecking(false);

    // 2. Calculate access using the freshest network result + current tier
    const freshHasAccess = freshOnlineStatus || tier === 'pro';

    if (!freshHasAccess) {
      alert("🔒 Access Denied! Your live connection check failed, and Free tier cannot work offline.");
      return;
    }

    // 3. Success! Spawn the block
    const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    setBlocks((prev) => [...prev, randomColor]);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: 'auto' }}>
      <h2>App Sandbox Shell</h2>

      <div style={{ padding: '15px', background: '#f1f5f9', borderRadius: '8px', marginBottom: '20px' }}>
        <p>Cached Network State: <strong>{isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}</strong></p>
        <p>User Tier: <strong style={{ color: tier === 'pro' ? '#0284c7' : '#e11d48' }}>{tier.toUpperCase()}</strong></p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        {/* Button 1 */}
        <button onClick={handleCheckNetwork} style={{ padding: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
          {checking ? "⏳ Querying Endpoint..." : "🔄 Button 1: Check Connection Status"}
        </button>

        {/* Button 2 */}
        <button onClick={toggleTier} style={{ padding: '12px', fontWeight: 'bold', backgroundColor: '#e2e8f0', cursor: 'pointer' }}>
          🔑 Button 2: Toggle Tier (Switch to {tier === 'free' ? 'PRO' : 'FREE'})
        </button>

        {/* Button 3: Double Duty Button */}
        <button 
          onClick={addBlock}
          disabled={checking}
          style={{ 
            padding: '12px', 
            fontWeight: 'bold', 
            backgroundColor: checking ? '#94a3b8' : hasAccessCurrently ? '#10b981' : '#64748b', 
            color: 'white', 
            border: 'none', 
            cursor: 'pointer' 
          }}
        >
          {checking ? "⏳ Verifying Link..." : "➕ Button 3: Ping & Spawn Workspace Block"}
        </button>

      </div>

      {/* Output Render Viewport */}
      <div style={{ marginTop: '25px', borderTop: '2px dashed #cbd5e1', paddingTop: '20px' }}>
        <h4>Simulated R3F/OPFS Workspace Container:</h4>
        
        {!hasAccessCurrently ? (
          <div style={{ padding: '20px', background: '#ffe4e6', color: '#9f1239', borderRadius: '6px' }}>
            <strong>Workspace Suspended:</strong> Reconnect to the internet or switch your account state to PRO to work out of range.
          </div>
        ) : (
          <div>
            <p style={{ color: '#475569', fontSize: '0.9rem' }}>
              Status: <i>{isOnline ? "Streaming assets live via R2" : "⚡ Working out of local OPFS cache (Jungle Mode)"}</i>
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {blocks.map((color, idx) => (
                <div key={idx} style={{ width: '40px', height: '40px', backgroundColor: color, borderRadius: '4px' }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AppStoreProvider initialTier="free">
      <SandboxWorkspace />
    </AppStoreProvider>
  );
}