// 📄 src/components/BlockSpawner.tsx
'use client'

import { useState } from 'react';
import { useNetworkStore } from "../stores/useNetworkStore";

export function BlockSpawner() {
  // Subscribe to the global authenticated state
  const authenticated = useNetworkStore((state) => state.authenticated);
  const [blocks, setBlocks] = useState<string[]>([]);

  const addBlock = () => {
    if (!authenticated) {
      alert("🔒 Access Denied! You must be authenticated to spawn shapes.");
      return;
    }

    // Pick a random bright color
    const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];    
    setBlocks(prev => [...prev, randomColor]);
  };

  return (
    <div style={{ marginTop: '30px', padding: '20px', border: '1px dashed #64748b', borderRadius: '8px' }}>
      <h3>Feature Gate Test</h3>
      
      <button
        onClick={addBlock}
        style={{
          padding: '10px 20px',
          backgroundColor: authenticated ? '#10b981' : '#64748b',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        {authenticated ? "➕ Spawn Colored Block" : "🔒 Unlock with Auth Button Above"}
      </button>

      {/* Render the blocks if authenticated */}
      {authenticated && blocks.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '15px' }}>
          {blocks.map((color, index) => (
            <div
              key={index}
              style={{
                width: '50px',
                height: '50px',
                backgroundColor: color,
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                animation: 'pulse 1s infinite alternate'
              }}
            />
          ))}
        </div>
      )}
      
      {/* Dynamic helper text */}
      {!authenticated && blocks.length > 0 && (
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '10px' }}>
          <i>({blocks.length} blocks are hidden because you logged out)</i>
        </p>
      )}
    </div>
  );
}