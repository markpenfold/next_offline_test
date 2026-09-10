"use client";

import React, { useState } from 'react';
import { useAppStore } from "@/providers/AppStoreProvider";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import styles from '@/app/styles/dashboard.module.css';
import { Box } from 'lucide-react';
export function SandboxWorkspace() {
  // 1. Auth & Profile State from AppStore
  const tier = useAppStore((s) => s.tier);
  const profile = useAppStore((s) => s.profile);
  const authStatus = useAppStore((s) => s.authStatus);
  const activeAccount = useAppStore((s) => s.activeAccount);

  // 2. Connectivity State from ConnectivityStore
  const isOnline = useConnectivityStore(
  (state) => state.network === 'online'
)
  const checkR2 = useConnectivityStore((s) => s.checkR2);

  const [blocks, setBlocks] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  // 3. Loading View
  if (authStatus === 'loading') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#64748b' }}>⚡ Authenticating & syncing lease records...</p>
      </div>
    );
  }

  // 4. Access Matrix: Allowed if online OR PAID subscriber tier
  const hasAccessCurrently = isOnline || tier !== 'free';

  const addBlock = async () => {
    setChecking(true);

    // Force an active healthcheck ping to verify endpoint connection
    await checkR2();

    setChecking(false);

    // Re-verify against fresh connectivity state
    const currentNetwork = useConnectivityStore.getState().network;
    const freshHasAccess = currentNetwork === 'online' || tier !== 'free';

    if (!freshHasAccess) {
      alert("🔒 Access Denied! You are currently offline and your account is on the Free tier.");
      return;
    }

    // Spawn block on success
    const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    setBlocks((prev) => [...prev, randomColor]);
  };


      return (
    <div className={styles.gridCard}>
      {/* Matching Card Header */}
      <div className={styles.cardHeader}>
        <div className={styles.headerTitleGroup}>
        <Box size={21} strokeWidth={1.8} className={styles.headerIcon} />
        <h1 className={styles.AccountCardHeader}>Sandbox</h1>
        </div>
      </div>
        <div className={styles.cardBody}>
            
      <p className={styles.detailText}>
        Account: {activeAccount?.id || profile?.username || 'Guest'}
      </p>

      <div style={{ padding: '15px', background: '#f1f5f9', borderRadius: '8px', marginBottom: '20px' }}>
        <p style={{ marginTop: 0 }}>
          Cached Network State: <strong>{isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}</strong>
        </p>
        <p style={{ marginBottom: 0 }}>
          User Tier:{" "}
          <strong style={{ color: tier !== 'free' ? '#0284c7' : '#e11d48' }}>
            {tier?.toUpperCase() ?? 'FREE'}
          </strong>
        </p>
        <p style={{ marginBottom: 0 }}>
          User email: <strong style={{ color: '#e11d48' }}>{profile?.email ?? 'N/A'}</strong>
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          onClick={addBlock}
          disabled={checking}
          className='fullButtonGreen btn'
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
      <div className={styles.cardFooter}></div>
    </div>
  )
}

