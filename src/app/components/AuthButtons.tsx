// 📄 src/components/AuthButtons.tsx
'use client'

import { useState } from 'react';
import { useNetworkStore } from "../stores/useNetworkStore";
import { simulateServerAuth } from "@/app/actions";

export function AuthButtons() {
  // Subscribe to the new global variable
  const authenticated = useNetworkStore((state) => state.authenticated);
  const setAuthenticated = useNetworkStore((state) => state.setAuthenticated);
  
  const [isPending, setIsPending] = useState(false);

  const handleAuthToggle = async (shouldSucceed: boolean) => {
    setIsPending(true);
    try {
      // 🚀 Fire off the Next.js Server Action
      const result = await simulateServerAuth(shouldSucceed);
      
      // 🧠 Set the global Zustand store variable
      setAuthenticated(result);
    } catch (err) {
      console.error("Server Action failed", err);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div style={{ marginTop: '30px', padding: '20px', border: '1px dashed #475569', borderRadius: '8px' }}>
      
      
      <p>
        Global Auth State set in Store:
        <br></br> <strong>{authenticated ? "🔒 PRO" : "🔓 FREE"}</strong>
      </p>

      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
        <button
          disabled={isPending}
          onClick={() => handleAuthToggle(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.6 : 1
          }}
        >
          PRO (Return True)
        </button>

        <button
          disabled={isPending}
          onClick={() => handleAuthToggle(false)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.6 : 1
          }}
        >
          FREEMIUM (Return False)
        </button>
      </div>
    </div>
  );
}