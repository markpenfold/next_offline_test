// src/stores/app-store.ts
import { createStore } from 'zustand/vanilla';
import { isReallyOnline } from '@/lib/utils/checkOnline';
import { decodeLeaseJwt } from '@/lib/auth/crypto';
import { type UserTier, TIERS, AccountContext, AppState, LoginPayload, } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { fetchUserAccounts } from '@/lib/supabase/queries'

const supabase = createClient();

export const createAppStore = (initialTier: UserTier = TIERS.NONE) => {
  console.log("CreateAppStore RUNS with initial Tier of:",initialTier );

  return createStore<AppState>()((set, get) => ({
    // Default Initial States
    authStatus: 'unknown',
    isOnline: true,
    tier: initialTier,
    userId: null,
    profile: null,
    offlineLeaseJwt: null,
    activeAccount: null,
    accounts: [],

    // Rules engine
    canAccessWorkspace: () => {
      const { isOnline, tier } = get();
      return isOnline || (tier !== TIERS.FREE && tier !== TIERS.NONE);
    },

    // Double checks with API ping whether we are connected
    checkNetwork: async () => {
      const online = typeof window !== 'undefined' && navigator.onLine 
        ? await isReallyOnline() 
        : false;
      set({ isOnline: online });
      return online;
    },

    /////////////////////////////////////////////////////////////////////////////////
    // 🧠 HIGH-LEVEL ORCHESTRATION ENGINE ///////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////////
    initializeWorkspace: async () => {
      console.log("Starting Workspace Initialization...");
      
      if (get().authStatus === 'loading') return;
      set({ authStatus: 'loading' });
      await get().checkNetwork();

      const isReturningFromStripe = typeof window !== 'undefined' && window.location.search.includes('session_id=');
      
      // Scenario A: User just passed checkout. Bypass local storage completely to capture up-to-date DB records.
      if (isReturningFromStripe) {
        console.log("Stripe parameter found in address line. Forcing structural network rebuild...");
        await get().syncFromDatabase();
        return;
      }

      // Scenario B: Standard app launch. Attempt immediate hydration from disk.
      const successfullyHydrated = get().hydrateFromCache();
      if (successfullyHydrated) {
        return; // Cache was present, validated, and loaded. We're done.
      }

      // Scenario C: Cold boot / Missing cache / Password Update Auto-Login. Check for ambient cookies.
      console.log("Local storage lease empty or expired. Checking ambient cookie states...");
      await get().syncFromDatabase();
    },

    /////////////////////////////////////////////////////////////////////////////////
    // 🪵 ISOLATED SUB-ROUTINES ////////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////////

    // 1. LOCAL CACHE HYDRATION
    hydrateFromCache: () => {
      const savedLease = localStorage.getItem('jungle_lease_v2');
      if (!savedLease) return false;

      try {
        const parsed = JSON.parse(savedLease);
        const decoded = decodeLeaseJwt(parsed.offlineLeaseJwt);
        console.log("FROM CACHE: ", parsed);
        
        // Ensure token exists and hasn't expired yet
        if (decoded && decoded.exp > Math.floor(Date.now() / 1000)) {
          const isSupabaseToken = !!(decoded as any)?.iss && (decoded as any).iss.includes('supabase.co');
          const finalUserId = isSupabaseToken ? (decoded as any).sub : (decoded as any).userId;
          const finalTier = isSupabaseToken ? ((decoded as any).user_metadata?.pending_plan || 'free') : ((decoded as any).tier || 'free');

          set({
            offlineLeaseJwt: parsed.offlineLeaseJwt,
            userId: finalUserId,
            tier: parsed.tier || finalTier, // Trust updated modifications to lease object data
            profile: parsed.profile,
            accounts: parsed.accounts || [],
            activeAccount: parsed.activeAccountId || parsed.accounts[0]?.id || null,
            authStatus: 'authenticated'
          });
          console.log("✅ Memory successfully loaded from valid local cache.");
          return true;
        }
      } catch (e) {
        console.error("Failed to parse local lease payload safely:", e);
      }
      return false; 
    },

    // 2. LIVE DATABASE SYNCHRONIZATION (Handles Stripe returns & Auto-Logins from password changes)
    syncFromDatabase: async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        // If no active auth cookie is detected on the device, nuke local states safely
        if (!session?.user) {
          console.log("❌ No active database session found. Clearing client environment.");
          get().clearSlate();
          return;
        }

        const user = session.user;
        console.log(`👤 Active session found for user: ${user.email}. Restructuring memory templates...`);
        console.log("FULL USER FROM SESSION: ", user)
        
        // Pull corresponding user accounts from the database
        let fetchedAccounts: AccountContext[] = [];
        try {
          fetchedAccounts = await fetchUserAccounts(supabase, user.id);
          } catch (dbErr) {
            console.error("Error fetching live database records:", dbErr);
          }

        const targetActiveAccountId = fetchedAccounts[0]?.id || null;
        // Check database value first, then metadata fallback, default to free
        const finalTier = fetchedAccounts[0]?.plan_name || user.user_metadata?.pending_plan || 'free';

        const formattedProfile = {
          name: user.user_metadata?.name || null,
          username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
          hasAvatar: !!user.user_metadata?.avatar_url,
          email: user.email || '',
        };

        // Construct pristine brand-new lease object from scratch
        const localCacheState = {
          offlineLeaseJwt: session.access_token,
          profile: formattedProfile,
          authStatus: 'authenticated',
          tier: finalTier,
          activeAccountId: targetActiveAccountId,
          accounts: fetchedAccounts
        };

        // Commit newly verified lease data directly to local disk cache
        localStorage.setItem('jungle_lease_v2', JSON.stringify(localCacheState));
        
        // Update live memory store values
        set({
          offlineLeaseJwt: session.access_token,
          userId: user.id,
          tier: finalTier,
          profile: formattedProfile,
          accounts: fetchedAccounts,
          activeAccount: targetActiveAccountId,
          authStatus: 'authenticated'
        });
        console.log("🔄 Client workspace successfully synced with live database source-of-truth.");
      } catch (err) {
        console.error("Critical error encountered during live network sync:", err);
        get().clearSlate();
      }
    },

    // 3. EXPLICIT INTERCEPT HANDLER (Called when user types credentials into standard forms)
    loginSuccess: (payload: LoginPayload) => {
      console.log("🎯 Explicit login caught. Writing custom payload to memory...", payload.user.name);

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

      localStorage.setItem('jungle_lease_v2', JSON.stringify(localCacheState));
      
      set({
        offlineLeaseJwt: payload.token,
        userId: payload.user.id,
        profile: formattedProfile,
        tier: payload.tier,
        activeAccount: activeAccountId, 
        accounts: payload.accounts,
        authStatus: 'authenticated'
      });
    },

    // 4. THE LOCAL DATA WIPE
    clearSlate: () => {
      console.log("🧹 Wiping persistent device memory data...");
      localStorage.removeItem('jungle_lease_v2');
      set({
        authStatus: 'unauthenticated',
        tier: TIERS.NONE,
        userId: null,
        profile: null,
        offlineLeaseJwt: null,
        activeAccount: null,
        accounts: []
      });
    },

    // 5. GLOBAL DE-AUTHENTICATION SIGN-OUT ACTION
    logout: async () => {
      console.log("🧼 Initiating global application signout...");
      try {
        // If online, tell Supabase to sign out and invalidate server cookies
        if (get().isOnline) {
          await supabase.auth.signOut();
        }
      } catch (e) {
        console.error("Supabase remote signout failed:", e);
      } finally {
        // Always clean up the local environment, regardless of network state
        get().clearSlate();
      }
    },

    // 6. IN-PLACE REALTIME UPGRADE REFRESHER
    refreshTier: async () => {
      const currentActiveAccount = get().activeAccount;
      if (!currentActiveAccount) return;

      try {
        
        console.log("Syncing subscription tier with database...");

        // get plan name given the active account ID
        const { data, error } = await supabase
          .from('accounts')
          .select('plan_name')
          .eq('id', currentActiveAccount)
          .single();

        if (data && !error) {
          const freshTier = (data.plan_name?.toLowerCase() || 'none') as UserTier;
          
          set({ tier: freshTier });

          const currentAccounts = get().accounts;
          const updatedAccounts = currentAccounts.map(acc => 
            acc.id === currentActiveAccount ? { ...acc, tier: freshTier } : acc
          );
          set({ accounts: updatedAccounts });
          
          const savedLease = localStorage.getItem('jungle_lease_v2');
          if (savedLease) {
            const parsed = JSON.parse(savedLease);
            localStorage.setItem('jungle_lease_v2', JSON.stringify({ 
              ...parsed, 
              tier: freshTier,
              accounts: updatedAccounts
            }));
          }
          console.log(`✨ Local workspace sync complete! Current tier: ${freshTier}`);
        }
      } catch (e) {
        console.error('Failed to sync live tier from database:', e);
      }
    },
  }));
};

export type AppStoreInstance = ReturnType<typeof createAppStore>;