// 📄 src/stores/app-store.ts
import { createStore } from 'zustand/vanilla';
import { isReallyOnline } from '@/lib/utils/checkOnline';
import { decodeLeaseJwt } from '@/lib/auth/crypto';
import { type UserTier, TIERS, AccountContext } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';


export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unknown';

export interface UserProfile {
  name: string | null;
  username: string | null;
  hasAvatar: boolean;
  email:string;
}

interface LoginPayload {
  token: string;
  tier: UserTier;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    username: string;
    hasAvatar: boolean;
  };
  accounts: AccountContext[];
}

export interface AppState {
  // Centralized State Fields
  authStatus: AuthStatus;
  isOnline: boolean;
  tier: UserTier;
  userId: string | null;
  profile: UserProfile | null;
  offlineLeaseJwt: string | null;
  activeAccount: string | null;
  accounts: AccountContext[];
  
  // Actions
  canAccessWorkspace: () => boolean;
  checkNetwork: () => Promise<boolean>;
  loginSuccess: (payload: LoginPayload) => void;
  initializeWorkspace: () => Promise<void>;
  logout: () => Promise<void>;
  refreshTier: () => Promise<void>;
  
}
console.log("so we get to here")
const supabase = createClient();

// This is a factory function. It initializes the store with default values. 
// It creates a "Source of Truth" that exists entirely in memory. 
// Each session has its own store
export const createAppStore = (initialTier: UserTier = TIERS.NONE) => {
 console.log("CreateAppStore RUNS")

  return createStore<AppState>()((set, get) => ({
    authStatus: 'unknown',
    isOnline: true,
    tier: initialTier,
    userId: 'FAIL!',
    profile: null,
    offlineLeaseJwt: null,
    activeAccount:  null,
    accounts: [],

    // Centralized rule: Access if online OR not on free tier
    canAccessWorkspace: () => {
      const { isOnline, tier } = get();
      return isOnline || tier !== TIERS.FREE && tier !== TIERS.NONE;
    },

    // double checks with API ping whether we are connected
    checkNetwork: async () => {
      console.count('checkNetwork called');
      const online = typeof window !== 'undefined' && navigator.onLine 
        ? await isReallyOnline() 
        : false;
      set({ isOnline: online });
      return online;
    },

    /////////////////////////////////////////////////////////////////
    // USER HAS JUST LOGGED IN //////////////////////////////////////
    loginSuccess: (payload: LoginPayload) => {
      console.log("login success", payload.user.name)
      // 🎯 Map the raw server payload directly inside the store
      const formattedProfile = {
        name: payload.user.name,
        username: payload.user.username,
        hasAvatar: payload.user.hasAvatar,
        email: payload.user.email || '',
      };

      const activeAccountId = payload.accounts[0]?.id || null;

      const localCacheState = {
        offlineLeaseJwt: payload.token,
        profile: formattedProfile,
        authStatus: 'authenticated',
        tier: payload.tier,
        activeAccountId,
        accounts: payload.accounts
      };

      // 📦 Atomically write to LocalStorage and update the state brain
      localStorage.setItem('jungle_lease_v2', JSON.stringify(localCacheState));
      
      set({
        offlineLeaseJwt: payload.token,
        profile: formattedProfile,
        tier: payload.tier,
        activeAccount: payload.accounts[0]?.id || null, 
        accounts: payload.accounts,
        authStatus: 'authenticated'
      });
    },


    /////////////////////////////////////////////////////////////////////////////////
    // 🧠 CENTRALIZED EVALUATOR ENGINE ///////////////////////////////////////////////
    // GETS JWT FROM COOKIES, LOCAL STORAGE 
    //////////////////////////////////////////////////////////////////////////////////
    initializeWorkspace: async () => {
      console.log("init Workspace")
      
      // Add a guard to prevent redundant re-initialization loops
      if (get().authStatus === 'loading') {
         // Optionally: log if this is hit while already loading
         console.log("workspace data loading")
      }

      set({ authStatus: 'loading' });

      await get().checkNetwork();

      let targetToken: string | null = null;
      let targetProfile: UserProfile | null = null;

      // 1. LOCAL-FIRST PRIORITY: Check for valid lease in LocalStorage
      const savedLease = localStorage.getItem('jungle_lease_v2');

      // HARD STOP: If the user explicitly logged out or has no cache, KILL IT HERE.
      if (!savedLease) {
        console.log(" No local lease cache found. Halting auto-login framework safely.");
        set({ authStatus: 'unauthenticated', tier:  TIERS.NONE, profile: null });
        return;
      }
      
      if (savedLease) {
        //console.log("savedlease in init:", savedLease);
        try {
          const parsed = JSON.parse(savedLease);
          //console.log("parsed:", parsed)
          const tokenToDecode = parsed.offlineLeaseJwt;
          //console.log("tokenToDecode", tokenToDecode)
          const decoded = decodeLeaseJwt(tokenToDecode);
          //console.log("decoded", decoded)
          
          if (decoded && decoded.exp > Math.floor(Date.now() / 1000)) {
           // console.log("decoded so tier is:", decoded.tier, 'user is:', decoded.userId)
          
          // Determine token origin (Custom vs Supabase)
          const isSupabaseToken = !!(decoded as any)?.iss && (decoded as any).iss.includes('supabase.co');
          
          const finalUserId = isSupabaseToken ? (decoded as any).sub : (decoded as any).userId;
          const finalTier = isSupabaseToken ? ((decoded as any).user_metadata?.pending_plan || 'free') : ((decoded as any).tier || 'free');

          set({
            offlineLeaseJwt: tokenToDecode,
            userId: finalUserId,
            tier: finalTier,
            profile: parsed.profile,
            authStatus: 'authenticated'
          });
          return;
        }
      } catch (e) {
        console.error("Corrupted lease format encountered:", e);
        }
      }


      // 3. CLEAN SLATE: Only if both fail
      console.log("Cleaning the slate!!!!!!!!!!!")
      set({ authStatus: 'unauthenticated', tier: TIERS.NONE, profile: null, offlineLeaseJwt: null });
    },



    // 🧼 THE PURGE ACTION: Atomically wipes client data structures
    logout: async () => {
      console.log("🧼 Executing global workspace purge...");

      try {
        // 1. Clear the persistent lease disk token
        localStorage.removeItem('jungle_lease_v2');

        // 2. Reset the Zustand store back to an unauthenticated blank slate
        set({
          offlineLeaseJwt: null,
          userId: null,
          profile: null,
          activeAccount: null,
          accounts: [],
          authStatus: 'unauthenticated',
          tier: 'none'
        });
      } catch (e) {
        console.error("Failed to clean up local device storage:", e);
      }
    },

    // Add to the store implementation
refreshTier: async () => {
  try {
    const response = await fetch('/api/me/tier')
    const { tier } = await response.json()
    
    // Update store
    set({ tier })
    
    // Update localStorage atomically
    const savedLease = localStorage.getItem('jungle_lease_v2')
    if (savedLease) {
      const parsed = JSON.parse(savedLease)
      localStorage.setItem('jungle_lease_v2', JSON.stringify({ ...parsed, tier }))
    }
  } catch (e) {
    console.error('Failed to refresh tier:', e)
  }
},


  }

));
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