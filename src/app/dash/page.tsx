// 📄 src/app/dashboard/page.tsx
'use client'

import { useEffect, useState } from "react";
import { useAppStore } from "@/providers/AppStoreProvider";
import { createClient } from '@/lib/supabase/client'

function SandboxWorkspace() {
  // 1. Sync directly with our offline-first orchestration store
  const isOnline = useAppStore((s) => s.isOnline);
  const tier = useAppStore((s) => s.tier);
  console.log("THE TIER: ", tier)
  const profile = useAppStore((s) => s.profile);
  console.log("THE PROFILE: ", profile)
  const authStatus = useAppStore((s) => s.authStatus);
  const checkNetwork = useAppStore((s) => s.checkNetwork);

  const [blocks, setBlocks] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const supabase = createClient();

  const handleLogout = async (e: React.MouseEvent) => {
    console.log("loggin out and clearing localStorage - jungle_lease_v2")
    e.preventDefault()
    await supabase.auth.signOut()
    localStorage.removeItem('jungle_lease_v2')
    window.location.href = '/login'
  }

  useEffect(() => {
    checkNetwork();
  }, [checkNetwork]);

  // 2. LOADING: Prevent flash of unauthenticated or incorrect default state
  if (authStatus === 'loading') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#64748b' }}>⚡ Authenticating & sync lease records...</p>
      </div>
    );
  }

  // 3. Rule Matrix: Allowed if online OR if they have ANY subscription tier other than 'free'
  const hasAccessCurrently = isOnline || tier !== 'free';

  const handleCheckNetwork = async () => {
    setChecking(true);
    await checkNetwork();
    setChecking(false);
  };

  const addBlock = async () => {
    setChecking(true);
    
    // Force a fresh low-level ping to verify connection status
    const freshOnlineStatus = await checkNetwork(); 
    
    setChecking(false);

    // Re-verify compliance instantly against the real-time wire status
    const freshHasAccess = freshOnlineStatus || tier !== 'free';

    if (!freshHasAccess) {
      alert("🔒 Access Denied! You are currently offline and your account is on the Free tier.");
      return;
    }

    // Success! Spawn the block
    const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    setBlocks((prev) => [...prev, randomColor]);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: 'auto' }}>
      <h2>App Sandbox Shell</h2>
      <button onClick={handleLogout}>
              Logout
            </button>

      {/* Profile Details (Hydrated via Offline Handshake lease) */}
      <div style={{ padding: '15px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px' }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#64748b' }}>Logged User Profile:</p>
        <strong>👤 {profile?.name || 'Anonymous User'}</strong> 
        <span style={{ fontSize: '0.85rem', color: '#64748b', marginLeft: '6px' }}>@{profile?.username || 'unknown'}</span>
      </div>

      <div style={{ padding: '15px', background: '#f1f5f9', borderRadius: '8px', marginBottom: '20px' }}>
        <p style={{ marginTop: 0 }}>Cached Network State: <strong>{isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}</strong></p>
        <p style={{ marginBottom: 0 }}>User Tier: <strong style={{ color: tier !== 'free' ? '#0284c7' : '#e11d48' }}>{tier.toUpperCase()}</strong></p>
                <p style={{ marginBottom: 0 }}>User email: <strong style={{ color: '#e11d48' }}>{profile?.email}</strong></p>

      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        <button onClick={handleCheckNetwork} style={{ padding: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
          {checking ? "⏳ Querying Endpoint..." : "🔄 Check Connection Status"}
        </button>

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
          {checking ? "⏳ Verifying Link..." : "Simulate work event"}
        </button>

      </div>

      {/* Output Render Viewport */}
      <div style={{ marginTop: '25px', borderTop: '2px dashed #cbd5e1', paddingTop: '20px' }}>
        <h4>Simulated R3F/OPFS Workspace Container:</h4>
        
        {!hasAccessCurrently ? (
          <div style={{ padding: '20px', background: '#ffe4e6', color: '#9f1239', borderRadius: '6px' }}>
            <strong>Workspace Suspended:</strong> Reconnect to the internet or upgrade your account tier beyond FREE to create items offline.
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

      <SandboxWorkspace />
 
  );
}