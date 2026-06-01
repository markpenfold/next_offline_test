// 📄 src/providers/AppStoreProvider.tsx
'use client'

import { createContext, useContext, useRef } from 'react';
import { useStore } from 'zustand';
import { createAppStore, type AppStoreInstance, type AppState } from '@/app/stores/app-store';

const AppStoreContext = createContext<AppStoreInstance | null>(null);

export function AppStoreProvider({ children, initialTier = 'free' }: { children: React.ReactNode; initialTier?: 'free' | 'pro' }) {
  const storeRef = useRef<AppStoreInstance>(null);
  if (!storeRef.current) {
    storeRef.current = createAppStore(initialTier);
  }
  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore<T>(selector: (store: AppState) => T): T {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error('useAppStore must be used within AppStoreProvider');
  return useStore(context, selector);
}