// 📄 src/actions/auth.ts
'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { generateOfflineLeaseJwt } from '@/lib/auth/crypto'
import { type UserTier, TIERS } from '@/lib/types'
import { type PostgrestSingleResponse, type PostgrestResponse } from '@supabase/supabase-js';
import { type SupabaseClient, type User } from '@supabase/supabase-js';
import { type LoginResult, AccountContext, ProfileRecord, MembershipRecord  } from '@/lib/types'

export async function login(formData: FormData): Promise<LoginResult> {
  console.log("login")
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { success: false, error: 'Email and password are required.' }
  }

  // 1. Authenticate credentials via Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  // get out early if auth failed
  if (authError || !authData.user) {
    return { success: false, error: 'Invalid credentials' }
  }

  // grab the user from auth process
  const user = authData.user

  // Query supabase to get user details now we know they're OK.
  // We need profile and membership info
  const [profileResult, membershipsResult] = await getUserDetails(user, supabase);
  const { data: profile, error: profileError } = profileResult;
  const { data: memberships, error: memError } = membershipsResult;

  console.log("profileResult:", profileResult, "membershipsResult:", membershipsResult);

  // success or failure? 
  // early returns for both profile and membership errors
  if (profileError || !profile) {
    return { success: false, error: 'Failed to retrieve user profile records.' };
  }
  if (memError || !memberships) {
    return { success: false, error: 'Failed to retrieve workspace account relations.' };
  }

  // 2. Safe Fallback Return: Direct client to signup if no memberships exist
  // Only thin here that matters is the returnUrl - /signup
  if (memberships.length === 0) {
    return {
      success: true,
      payload: {
        token: '',
        redirectUrl: '/signup',
        tier: 'free', // 🆕 Send the determined tier down

        user: {
          id: profile.id,
          email: user.email || null,
          name: profile.full_name,
          username: profile.username,
          hasAvatar: !!profile.has_avatar
        },
        accounts: []
      }
    }
  }

  // 3. Transform database query layers and SORT by 'owner' priority
  const accounts: AccountContext[] = memberships
    .filter(mem => mem.accounts !== null && typeof mem.accounts === 'object' && !Array.isArray(mem.accounts)) 
    .map(mem => {
      const acc = mem.accounts as any 
      
      return {
        id: acc.id,
        name: acc.name,
        tier: (acc.plan_name?.toLowerCase() || TIERS.FREE) as UserTier,
        subscriptionStatus: acc.subscription_status,
        role: mem.role,
        isPersonal: !!acc.is_personal 
      }
    })
    // 🧬 SERVER-SIDE SORTING: Prioritize accounts where user is 'owner'
    .sort((a, b) => {
      if (a.role === 'owner' && b.role !== 'owner') return -1;
      if (a.role !== 'owner' && b.role === 'owner') return 1;
      return 0;
    });

  // Edge case handle: Filtered out invalid accounts entirely
  if (accounts.length === 0) {
    return { success: false, error: 'No valid workspace accounts associated with this profile.' };
  }

  // 4. Calculate operational parameters from the primary sorted account
  const primaryAccount = accounts[0];
  const targetLeaseTier: UserTier = primaryAccount.tier || TIERS.FREE;
  const targetAccountId: string = primaryAccount.id; // 🆕 Grab the verified account ID

  // 5. 🔐 Generate the Cryptographic Subscription Lease
  const issuedAt = Math.floor(Date.now() / 1000)
  const fourteenDaysInSeconds = 14 * 24 * 60 * 60
    
  const offlineLeaseJwt = await generateOfflineLeaseJwt({
    userId: user.id,
    accountId: targetAccountId,
    tier: targetLeaseTier,
    exp: issuedAt + fourteenDaysInSeconds,
    version: 1
  })

  // 6. Compute Workspace Target Redirection URI
  const redirectUrl =  '/dash'


  // 8. Return compiled single data payload to client form
  return {
    success: true,
    payload: {
      token: offlineLeaseJwt,
      redirectUrl,
      tier: targetLeaseTier, // 🆕 Send the determined tier down
      user: {
        id: profile.id,
        email: user.email || null,
        name: profile.full_name,
        username: profile.username,
        hasAvatar: !!profile.has_avatar
      },
      accounts // 🔄 This is now safely pre-sorted by ownership!
    }
  }
}

async function getUserDetails(user: User, 
  supabase: SupabaseClient
): Promise<[
  PostgrestSingleResponse<ProfileRecord>, 
  PostgrestResponse<MembershipRecord>
]>{

  // CONCURRENT PIPELINE: Run both queries in parallel
  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, username, has_avatar')
      .eq('id', user.id)
      .single(),
      
    supabase
      .from('memberships')
      .select(`
        account_id,
        role,
        accounts (
          id,
          name,
          plan_name,
          subscription_status,
          is_personal
        )
      `)
      .eq('user_id', user.id)
  ]);

  return [profileResult, membershipsResult];

}