// 📄 src/stores/app-store.ts
import { createStore } from 'zustand/vanilla';
import { isReallyOnline } from '@/lib/utils/checkOnline';
import { decodeLeaseJwt } from '@/lib/auth/crypto';
import { type UserTier, TIERS } from '@/lib/utils/constants';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface UserProfile {
  name: string | null;
  username: string | null;
  hasAvatar: boolean;
}

export interface AppState {
  // Centralized State Fields
  authStatus: AuthStatus;
  isOnline: boolean;
  tier: UserTier;
  userId: string | null;
  profile: UserProfile | null;
  offlineLeaseJwt: string | null;
  
  // Actions
  checkNetwork: () => Promise<boolean>;
  initializeWorkspace: () => Promise<void>;
  hydrateWorkspace: (token: string, profile: UserProfile) => void;
}

// This is a factory function. It initializes the store with default values. 
// It creates a "Source of Truth" that exists entirely in memory. 
// Each session has its own store
export const createAppStore = (initialTier: UserTier = TIERS.FREE) => {
  return createStore<AppState>()((set, get) => ({
    authStatus: 'loading',
    isOnline: true,
    tier: initialTier,
    userId: null,
    profile: null,
    offlineLeaseJwt: null,

    // double checks with API ping whether we are connected
    checkNetwork: async () => {
      const online = typeof window !== 'undefined' && navigator.onLine 
        ? await isReallyOnline() 
        : false;
      set({ isOnline: online });
      return online;
    },
    
    /////////////////////////////////////////////////////////////////////////////////
    // 🧠 CENTRALIZED EVALUATOR ENGINE ///////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////////
    initializeWorkspace: async () => {
      await get().checkNetwork();

      let targetToken: string | null = null;
      let targetProfile: UserProfile | null = null;

      // 1. Try to pluck credentials out of streaming cookies
      const streamCookie = getCookie('offline_lease_stream');
      if (streamCookie) {
        try {
          const parsedStream = JSON.parse(decodeURIComponent(streamCookie));
          targetToken = parsedStream.token;
          targetProfile = parsedStream.profile || parsedStream.user;
          document.cookie = "offline_lease_stream=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        } catch {
          targetToken = streamCookie;
        }
      }

      // 2. Fallback to localStorage if offline or refreshing
      if (!targetToken) {
        const savedLease = localStorage.getItem('jungle_lease_v2');
        if (savedLease) {
          try {
            const parsedCache = JSON.parse(savedLease);
            targetToken = parsedCache.token;
            targetProfile = parsedCache.user || parsedCache.profile;
          } catch {
            console.error("⚠️ Local storage lease cache corrupted.");
          }
        }
      }

      // 3. 🛡️ The Store Decides: Validate the lease cryptographically before letting the user in
      if (targetToken && targetProfile) {
        const decoded = decodeLeaseJwt(targetToken);
        const currentTime = Math.floor(Date.now() / 1000);
        const isLeaseValid = decoded ? decoded.exp > currentTime : false;

        if (isLeaseValid && decoded) {
          // Everything checks out—commit directly to state RAM in one clean atomic shot
          set({
            offlineLeaseJwt: targetToken,
            userId: decoded.userId,
            tier: decoded.tier,
            profile: {
              name: targetProfile.name,
              username: targetProfile.username,
              hasAvatar: !!targetProfile.hasAvatar
            },
            authStatus: 'authenticated'
          });
          return;
        }
      }

      // 4. Fallback Gate: No valid token or expired lease triggers a clean unauthenticated flag
      set({ authStatus: 'unauthenticated', tier: TIERS.FREE, profile: null, offlineLeaseJwt: null });
    },

    hydrateWorkspace: (token, profile) => {
      const decoded = decodeLeaseJwt(token);
      if (decoded) {
        set({
          offlineLeaseJwt: token,
          userId: decoded.userId,
          tier: decoded.tier,
          profile,
          authStatus: 'authenticated'
        });
      }
    }
  }));
};
export type AppStoreInstance = ReturnType<typeof createAppStore>;

// 🛠️ Simple, ultra-lightweight client side cookie extractor
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}