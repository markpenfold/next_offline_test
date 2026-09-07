'use client'

import { createContext, useContext, useRef, useEffect } from 'react';
import { useStore } from 'zustand';
import { createAppStore, type AppStoreInstance } from '@/stores/app-store';
import { type UserTier, TIERS, AppState } from '@/lib/tl_utils/types';
import { useConnectivityStore } from '@/stores/useConnectivityStore';

export const AppStoreContext = createContext<AppStoreInstance | null>(null);

export function AppStoreProvider({ 
  children, 
  initialTier = TIERS.FREE 
}: { 
  children: React.ReactNode; 
  initialTier?: UserTier 
}) {
  console.log("AppstoreProvider RUNS");
  const storeRef = useRef<AppStoreInstance>(null);
  const initializedRef = useRef(false);

  // 1. Instant Synchronous Creation of the Store
  if (!storeRef.current) {
    storeRef.current = createAppStore(initialTier);
  }

  // 2. Simple Boot Trigger & Connectivity Sync
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;

    // A. Run workspace boot once
    if (!initializedRef.current) {
      initializedRef.current = true;
      console.log("useEffect FIRED (Initializing Workspace)");
      store.getState().initializeWorkspace();
    }

    // B. Re-trigger workspace init if restorable from page cache (BFCache)
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        store.getState().initializeWorkspace();
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    // D. Passive Subscription: React to changes in Connectivity Store if needed
    const unsubscribeConnectivity = useConnectivityStore.subscribe((state) => {
      console.log("📡 Connectivity Store state changed to:", state.network);
      // Synchronize or trigger actions on app-store when connectivity changes:
      if (state.network === 'online') {
        store.getState().initializeWorkspace();
      }
    });

    return () => {
      window.removeEventListener('pageshow', handlePageShow);

      unsubscribeConnectivity();
    };
  }, []);

  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
}

// Custom hook to access app store
export function useAppStore<T>(selector: (store: AppState) => T): T {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error('useAppStore must be used within AppStoreProvider');
  return useStore(context, selector);
}