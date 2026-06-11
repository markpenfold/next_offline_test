// 📄 src/providers/AppStoreProvider.tsx
'use client'

import { createContext, useContext, useRef, useEffect } from 'react';
import { useStore } from 'zustand';
import { createAppStore, type AppStoreInstance, } from '@/stores/app-store';
import { type UserTier, TIERS, AppState } from '@/lib/types';

export const AppStoreContext = createContext<AppStoreInstance | null>(null);

export function AppStoreProvider({ children, initialTier = TIERS.FREE }: { children: React.ReactNode; initialTier?: UserTier }) {
  console.log("AppstorePRovider RUNS")
  const storeRef = useRef<AppStoreInstance>(null);
  
  // 1. Instant Synchronous Creation of the Brain //////////////
  //////////////////////////////////////////////////////////////
  if (!storeRef.current) {
    storeRef.current = createAppStore(initialTier);
  }/////////////////////////////////////////////////////////////


  // 2. Simple Boot Trigger & Passive Hardware Monitoring //////
  //////////////////////////////////////////////////////////////
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;

    console.log("🔥 useEffect FIRED");
    // THE SELF-STARTUP TRIGGER: Launches online/offline orchestration
    store.getState().initializeWorkspace();

    const handlePageShow = (e: PageTransitionEvent) => {
      console.log("📄 pageshow fired, persisted:", e.persisted);
      if (e.persisted) {
        store.getState().initializeWorkspace();
      }
    };

    window.addEventListener('pageshow', handlePageShow);

    // Catch immediate physical connection cuts or antenna restorations
    const handleOffline = () => store.setState({ isOnline: false });
    const handleOnline = () => store.getState().checkNetwork();

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []); ///////////////////////////////////////////////////////



  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
}

/// Function called by pages 
export function useAppStore<T>(selector: (store: AppState) => T): T {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error('useAppStore must be used within AppStoreProvider');
  return useStore(context, selector);
}