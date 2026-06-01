// 📄 src/stores/app-store.ts
import { createStore } from 'zustand/vanilla';
import { isReallyOnline } from '../checkOnline';

export interface AppState {
  isOnline: boolean;
  tier: 'free' | 'pro';
  
  // Actions
  checkNetwork: () => Promise<boolean>;
  toggleTier: () => void;
}

// Factory to create isolated stores per-user context
export const createAppStore = (initialTier: 'free' | 'pro' = 'free') => {
  return createStore<AppState>()((set) => ({
    isOnline: true,
    tier: initialTier,

    checkNetwork: async () => {
      const online = typeof window !== 'undefined' && navigator.onLine 
        ? await isReallyOnline() 
        : false;
      set({ isOnline: online });
      return online; // 🚀 CRUCIAL: Return the exact result of the live ping
    },

    toggleTier: () => set((state) => ({ 
      tier: state.tier === 'free' ? 'pro' : 'free' 
    })),
  }));
};

export type AppStoreInstance = ReturnType<typeof createAppStore>;