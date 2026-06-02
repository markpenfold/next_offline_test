// 📄 src/actions/auth.ts
'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { generateOfflineLeaseJwt } from '@/lib/auth/crypto'
import { type UserTier, TIERS } from '@/lib/utils/constants'

interface AccountContext {
  id: string;
  name: string | null;
  tier: UserTier;
  subscriptionStatus: string;
  role: string;
  isPersonal: boolean;
}

interface LoginResult {
  success: boolean;
  error?: string;
  payload?: {
    token: string;
    redirectUrl: string;
    user: {
      id: string;
      email: string | null;
      name: string | null;
      username: string;
      hasAvatar: boolean;
    };
    accounts: AccountContext[];
  };
}

export async function login(formData: FormData): Promise<LoginResult> {
  const cookieStore = await cookies()
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

  if (authError || !authData.user) {
    return { success: false, error: 'Invalid credentials' }
  }

  const user = authData.user

  // ⚡ CONCURRENT PIPELINE: Run both queries in parallel
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

  const { data: profile, error: profileError } = profileResult;
  const { data: memberships, error: memError } = membershipsResult;

  if (profileError || !profile) {
    return { success: false, error: 'Failed to retrieve user profile records.' };
  }

  if (memError || !memberships) {
    return { success: false, error: 'Failed to retrieve workspace account relations.' };
  }

  // 2. Safe Fallback Return: Direct client to signup if no memberships exist
  if (memberships.length === 0) {
    return {
      success: true,
      payload: {
        token: '',
        redirectUrl: '/signup',
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

  // 3. Transform database query layers into clean camelCase Account contexts
  // Fixed: Treating mem.accounts as an object rather than an array
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

  // Edge case handle: Filtered out invalid accounts entirely
  if (accounts.length === 0) {
    return { success: false, error: 'No valid workspace accounts associated with this profile.' };
  }

  // 4. Calculate their highest active subscription tier
  const activePremiumAccounts = accounts.filter(acc => acc.subscriptionStatus === 'active')
  
  let targetLeaseTier: UserTier = TIERS.FREE
  if (activePremiumAccounts.some(acc => acc.tier === TIERS.FOUNDER)) targetLeaseTier = TIERS.FOUNDER
  else if (activePremiumAccounts.some(acc => acc.tier === TIERS.TEAM)) targetLeaseTier = TIERS.TEAM
  else if (activePremiumAccounts.some(acc => acc.tier === TIERS.PRO)) targetLeaseTier = TIERS.PRO

  // 5. 🔐 Generate the Cryptographic 14-day Offline Subscription Lease
  const issuedAt = Math.floor(Date.now() / 1000)
  const fourteenDaysInSeconds = 14 * 24 * 60 * 60
  
  const offlineLeaseJwt = await generateOfflineLeaseJwt({
    userId: user.id,
    tier: targetLeaseTier,
    exp: issuedAt + fourteenDaysInSeconds,
    version: 1
  })

  // 6. Compute Workspace Target Redirection URI
  const isSingleAccount = accounts.length === 1
  const firstAccountId = accounts[0].id
  const redirectUrl =  '/dash'

  // 7. Bake standard Server Context Cookie for middleware/edge routing tasks
  cookieStore.set('user_workspace_context', JSON.stringify({
    count: accounts.length,
    defaultId: isSingleAccount ? firstAccountId : null
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7
  })

  // 8. Return compiled single data payload to client form
  return {
    success: true,
    payload: {
      token: offlineLeaseJwt,
      redirectUrl,
      user: {
        id: profile.id,
        email: user.email || null,
        name: profile.full_name,
        username: profile.username,
        hasAvatar: !!profile.has_avatar
      },
      accounts
    }
  }
}