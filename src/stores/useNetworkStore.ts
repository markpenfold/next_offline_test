// 📄 src/stores/useNetworkStore.ts
import { create } from 'zustand';
import { isReallyOnline } from '@/lib/utils/checkOnline';

interface NetworkState {
  isOnline: boolean;
  checkOnlineStatus: () => Promise<boolean>;
  
  // 🔐 New Auth States
  authenticated: boolean;
  setAuthenticated: (auth: boolean) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: true, 

  checkOnlineStatus: async () => {
    const online = await isReallyOnline();
    set({ isOnline: online });
    return online;
  },

  // 1. Value: Default to false (logged out)
  authenticated: false,

  // 2. Function: Direct setter for updating the state
  setAuthenticated: (auth: boolean) => set({ authenticated: auth }),
}));