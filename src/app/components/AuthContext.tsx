// 📄 src/AuthContext.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { User } from '@supabase/supabase-js'
import { isReallyOnline } from '../checkOnline' 

interface AuthState {
  isLoading: boolean
  isOnline: boolean
  user: User | null
}

interface AuthContextType {
  isLoading: boolean
  isOnline: boolean
  user: User | null
  refreshOnlineStatus: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoading: true,
    // Fix: Guard against server-side rendering execution
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true, 
    user: null,
  })

  const refreshOnlineStatus = async () => {
    const online = navigator.onLine ? await isReallyOnline() : false

    setState(prev => ({
      ...prev,
      isOnline: online
    }))

    return online
  }

  useEffect(() => {
    // 1. Hardware says offline -> Instant UI update, no ping required
    const handleOffline = () => {
      console.log("✈️ [Hardware] Connection lost. Switching to offline mode.")
      setState(prev => ({ ...prev, isOnline: false }))
    }

    // 2. Hardware says online -> Double check with your deep ping test
    const handleOnline = async () => {
      console.log("📡 [Hardware] Signaling connection. Verifying with deep ping...")
      
      const verified = await isReallyOnline()
      
      if (verified) {
        console.log("🟢 [Verification] Genuinely online. Syncing state...")
        setState(prev => ({ ...prev, isOnline: true }))
      } else {
        console.warn("🚫 [Verification] False alarm. Captive portal or no internet routing.")
        setState(prev => ({ ...prev, isOnline: false }))
      }
    }

    // Bind clean browser listeners
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check on app boot
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const baselineOnline = navigator.onLine ? await isReallyOnline() : false
      
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        isOnline: baselineOnline,
        user: session?.user || null 
      }))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(prev => ({ ...prev, user: session?.user || null }))
    })

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, refreshOnlineStatus }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}