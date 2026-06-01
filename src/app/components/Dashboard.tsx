'use client'

import { useAuth } from "./AuthContext"
import { NetworkButton } from "./NetworkButton"
import { useNetworkStore } from "../stores/useNetworkStore"
import { AuthButtons } from "./AuthButtons" // Import your new pair of buttons
import { BlockSpawner } from "./BlockSpawner"

export function Dashboard() {
  // 1. Keep useAuth strictly for Supabase session loading and user info
  const { user, isLoading } = useAuth()
 
  // 2. Read the global connection and server action states from Zustand
  const isOnline = useNetworkStore((state) => state.isOnline)
  const authenticated = useNetworkStore((state) => state.authenticated)

  if (isLoading) return <div className="p-5 text-white">Checking auth locally...</div>

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Next.js Network Test Shell</h1>
      
      {/* 🌐 Network Monitoring */}
      <div style={{ marginBottom: '20px' }}>
        <p>Connection State: <strong>{isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}</strong></p>
        <NetworkButton />
      </div>

      <hr style={{ borderColor: '#334155', margin: '20px 0' }} />

      {/* 🔐 Authentication Monitoring */}
      <div style={{ marginBottom: '20px' }}>
        {/* Supabase Context Session */}
        
        {/* Zustand Server Action Variable */}
        <p>Server Action State: <strong>{authenticated ? "🔒 AUTHENTICATED" : "🔓 GUEST"}</strong></p>
      </div>

      {/* Control panel for your server action test */}
      <AuthButtons />
      <BlockSpawner />
    </div>
  )
}