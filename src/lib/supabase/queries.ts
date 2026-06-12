import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'
import {createAdminClient} from '@/lib/supabase/admin'
import { type  AccountContext, type LoginResult, type UserTier, TIERS } from '@/lib/types'
import { generateOfflineLeaseJwt } from '@/lib/auth/crypto'
import { Database, Tables } from '@/lib/database_types'
import { SupabaseClient, QueryData } from '@supabase/supabase-js'
import Stripe from 'stripe'

// Using 'cache' ensures that if you call this 3 times in 
// one request, it only hits the database ONCE.
export const getProfile = cache(async () => {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles') // Ensure this matches your table name
    .select('id, full_name, has_avatar, username, updated_at')
    .eq('id', user.id)
    .single()
  console.log("getP is finding:", profile)
  return profile
})


// Using 'cache' ensures that if you call this 3 times in 
// one request, it only hits the database ONCE.
export async function getProfileFromUserId (uID:string){
  const supabase = await createClient()
  
  const { data: profile } = await supabase
    .from('profiles') // Ensure this matches your table name
    .select('id, full_name, has_avatar, username, updated_at')
    .eq('id', uID)
    .single()
  return profile;
}


export type AccountWithOwner = Pick<
  Tables<'accounts'>, 
  'id' | 'plan_name' | 'stripe_subscription_id' | 'paid_plan'
> & {
  user_id: string | null
}


export async function getAccountByStripeId(customerId: string): Promise<AccountWithOwner | null> {
  console.log("getAccountByStripeId")
  if (!customerId) return null
  
  const supabase: SupabaseClient<Database> = await createAdminClient()

  const { data, error } = await supabase
    .from('accounts')
    .select('id, plan_name, stripe_subscription_id, paid_plan')
    .eq('stripe_customer_id', customerId)
    .single()

  if (error) {
    console.warn(`[Queries] No account found for Stripe ID ${customerId}:`, error.message)
    return null
  }

  // Look Ma, no passed client! It handles itself internally.
  const user_id = await getAccountOwnerId(data.id)
  console.log("user_id from getAccountOwnerId:", user_id)

  return {
    id: data.id,
    plan_name: data.plan_name,
    stripe_subscription_id: data.stripe_subscription_id,
    paid_plan: data.paid_plan,
    user_id
  }
}

export async function getAccountOwnerId(accountId: string): Promise<string | null> {
  console.log("looking for owner of this account:", accountId, '-----------------------------------------------------------------')
  if (!accountId) return null

  // Create its own admin client to punch right through RLS in the webhook background
  const supabase: SupabaseClient<Database> = await createAdminClient()

  const { data: membership, error: memError } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('account_id', accountId)
    .eq('role', 'owner')
    .maybeSingle()

  if (memError || !membership?.user_id) {
    console.error(`[Query Error getAccountOwnerId] No owner found for account ${accountId}`)
    return null
  }
  
  return membership.user_id
}

export async function getAccountIdFromOwner(user_id:string): Promise<string | null> {
  const supabase = await createClient()

  if (!user_id) return null

  // 1. Get the owner's user_id from memberships
  const { data: membership, error: memError } = await supabase
    .from('memberships')
    .select('account_id')
    .eq('user_id', user_id )
    .eq('role', 'owner')
    .single()

  if (memError || !membership?.account_id) {
    console.error(`[Query Error] No account found for  ${user_id}`, memError?.message)
    return null
  }
    return membership.account_id
}

export async function getAccountOwner(accountId:string): Promise<string | null> {
  const supabase = await createClient()

  if (!accountId) return null

  // 1. Get the owner's user_id from memberships
  const { data: membership, error: memError } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('account_id', accountId)
    .eq('role', 'owner')
    .maybeSingle()

  if (memError || !membership?.user_id) {
    console.error(`[Query Error getAccountOwner] No owner found for account ${accountId}`, memError?.message)
    return null
  }

  // 2. Look up that user's email directly from your profile/user table
  const { data: profile, error: profError } = await supabase
    .from('profiles') // 👈 Change to 'users' if your profile table is named 'users'
    .select('email')
    .eq('id', membership.user_id)
    .maybeSingle()

  if (profError) {
    console.error(`[Query Error] Failed fetching email for user ${membership.user_id}:`, profError.message)
    return null
  }

  return profile?.email || null
}


// get SINGLE user account where they are the owner
export async function getActiveUserAccount( user_id: string) {
  
  const supabaseAdmin = await createAdminClient()

  const { data: membership, error: dbError } = await supabaseAdmin
      .from('memberships')
      .select('account_id, accounts(stripe_customer_id)')
      .eq('user_id',user_id)
      .eq('role', 'owner')
      .maybeSingle()

    if (dbError) {
    // Supabase throws an error if .single() finds 0 rows, 
    // so we catch it gracefully without breaking the app.
    console.warn(`[Queries] No account found for user ID ${user_id}:`, dbError)
    return null
  }

  return membership;
}

//get ALL ACCOUNTS this user owns 
export async function getActiveUserAccounts(user_id: string) {
  const supabaseAdmin = await createAdminClient();

  const { data: memberships, error: dbError } = await supabaseAdmin
    .from('memberships')
    .select('account_id, accounts(stripe_customer_id)')
    .eq('user_id', user_id)
    .eq('role', 'owner'); // Removed .maybeSingle() to allow arrays

  if (dbError) {
    console.error(`[Queries] Error fetching accounts for user ID ${user_id}:`, dbError);
    return [];
  }
  // If no memberships found, return an empty array safely
  if (!memberships) return [];
  return memberships;
}

export async function getUserProfile(userId: string): Promise<Tables<'profiles'> | null> {
  const supabase = await createAdminClient<Database>() // Or createAdminClient() depending on RLS

  const { data, error } = await supabase
    .from('profiles') // 💡 Change to your actual table name (e.g., 'users')
    .select('*')
    .eq('id', userId) // Assuming 'id' is the primary key linked to auth.users
    .single()

  if (error) {
    console.error('Error fetching profile:', error)
    return null
  }
  // TypeScript automatically infers 'data' 
  // as exactly matching Tables<'profiles'>
  return data
}

// used when we KNOW the account has no Stripe Customer ID. 
export async function setUpStripeCustomer(accountId:string, userId:string):Promise<string>{

      let stripeCustomerId:string | null = null;

        console.log("setting up Stripe Customer ID for userAccount:", accountId)
        const userProfile: Tables<'profiles'> | null = await getUserProfile(userId);

        // 2. Guard Clause: Typescript knows profile fields can be null. We must verify they exist.
        if (!userProfile || !userProfile.email) {
          throw new Error(`User profile or email missing for user ID: ${userId}`)
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: "2026-05-27.dahlia"
        })

        const existingCustomers = await stripe.customers.search({
          query: `email:'${userProfile.email}' AND metadata['account_id']:'${accountId}'`,
          limit: 1,
        });
        //double check with Stripe before creating a new ID
        if (existingCustomers.data.length > 0) {
          stripeCustomerId = existingCustomers.data[0].id
        } else {
          const customer = await stripe.customers.create({
            email: userProfile.email,
            metadata: { userId: userProfile.id, account_id: accountId},
          })
          stripeCustomerId = customer.id
        }
        
        if(!stripeCustomerId){
           throw new Error(`could not find or create a new stripe id for this user: ${userId}`)
        }

        const supabase = await createAdminClient<Database>()
        //Uses Admin Client to update system identity details seamlessly
        let result = await supabase
          .from('accounts')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', accountId)
          .select() // 🎯 Tells Supabase to return the modified data
          .single() // 🎯 Since we filter by id, narrow the array down to one object

          if (result.error) {
            throw new Error(`Database update failed: ${result.error.message}`)
          }
        
        return stripeCustomerId;
}

// Fetch ALL  ACCOUNTS + USER'S ROLE ///////////////////
export async function getAllUserAccountsWithRoles(user_id: string) {
  const supabaseAdmin = await createAdminClient();

  const { data: memberships, error: dbError } = await supabaseAdmin
    .from('memberships')
    .select(`
      account_id,
      role, 
      accounts (
        stripe_customer_id
      )
    `)
    .eq('user_id', user_id); // 🟢 Filter by user, but allow ALL roles!

  if (dbError) {
    console.error(`[Queries] Error fetching all accounts for user ID ${user_id}:`, dbError);
    return [];
  }

  if (!memberships) return [];

  // Clean and normalize the data array before sending it to your components
  return memberships.map((m) => {
    // Safely extract the account data whether Supabase types it as an array or object
    const accountDetails = Array.isArray(m.accounts) ? m.accounts[0] : m.accounts;

    return {
      account_id: m.account_id,
      role: m.role, // 🟢 Returns 'owner', 'member', 'admin', etc.
      stripe_customer_id: accountDetails?.stripe_customer_id || null,
    };
  });
}


// Define the query builder independently so TypeScript can inspect it
const getAccountContextQuery = (supabase: SupabaseClient, userId: string, accountId: string) =>
  supabase
    .from('memberships')
    .select(`
      account_id, 
      accounts(
        stripe_customer_id,
        stripe_subscription_id,
        subscription_status,
        stripe_subscription_item_id,
        plan_name
      )
    `)
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .eq('role', 'owner')
    .maybeSingle()

// extract the database response type from the query
type MembershipQueryResult = QueryData<ReturnType<typeof getAccountContextQuery>>

/** Safely fetches context for a workspace, validating that the user is the owner.*/
export async function getAccountContext(
  supabase: SupabaseClient, 
  userId: string, 
  accountId: string
) {
  const { data, error } = await getAccountContextQuery(supabase, userId, accountId)

  // the user is not OWNER or there was some other error
  // Sends NULL back to caller
  if (error || !data) return null

  // Cast safely using our inferred query type
  const membership = data as MembershipQueryResult

  // Clean up TypeScript array or object interpretation safely
  const accountData = Array.isArray(membership.accounts)
    ? membership.accounts[0]
    : membership.accounts

  // Just return the object. TypeScript infers the exact return type on the fly.
  return {
    accountId: membership.account_id,
    stripeCustomerId: accountData?.stripe_customer_id || null,
    stripeSubscriptionId: accountData?.stripe_subscription_id || null,
    stripeSubscriptionItemId: accountData?.stripe_subscription_item_id || null,
    subscriptionStatus: accountData?.subscription_status || null,
    planName: accountData?.plan_name || null,
  }
}

interface SessionDetailsResult {
  success: boolean;
  error?: string;
  data?: {
    accounts: AccountContext[];
    primaryAccount: AccountContext | null;
    userPayload: {
      id: string;
      email: string | null;
      name: string;
      username: string;
      hasAvatar: boolean;
    };
  };
}

// Define what a membership object looks like from your database query
interface DatabaseMembership {
  role: string;
  accounts: {
    id: string;
    name: string;
    plan_name?: string | null;
    subscription_status?: string | null;
    is_personal?: boolean | null;
  } | null | unknown; // accounts can be an object, null, or unknown before filtering
}

export async function generateUserSessionPayload(
  user: any,
  profileResult: { data: any; error: any },
  membershipsResult: { data: DatabaseMembership[] | null; error: any } 
): Promise<LoginResult> {
  const { data: profile, error: profileError } = profileResult;
  const { data: memberships, error: memError } = membershipsResult;

  if (profileError || !profile) {
    return { success: false, error: 'Failed to retrieve user profile records.' };
  }
  if (memError || !memberships) {
    return { success: false, error: 'Failed to retrieve workspace account relations.' };
  }

  const userPayload = {
    id: profile.id,
    email: user.email || null,
    name: profile.full_name,
    username: profile.username,
    hasAvatar: !!profile.has_avatar
  };

  if (memberships.length === 0) {
    return {
      success: true,
      payload: {
        token: '',
        redirectUrl: '/signup',
        tier: 'free', 
        user: userPayload,
        accounts: []
      }
    };
  }

  const accounts: AccountContext[] = memberships
    // TypeScript now knows 'mem' is a DatabaseMembership
    .filter((mem): mem is DatabaseMembership & { accounts: Record<string, any> } => 
      mem.accounts !== null && typeof mem.accounts === 'object' && !Array.isArray(mem.accounts)
    ) 
    .map(mem => {
      const acc = mem.accounts as any;
      return {
        id: acc.id,
        name: acc.name,
        plan_name: (acc.plan_name?.toLowerCase() || TIERS.FREE) as UserTier,
        subscription_status: acc.subscription_status || 'none',
        role: mem.role,
        is_personal: !!acc.is_personal 
      };
    })
    .sort((a, b) => {
      if (a.role === 'owner' && b.role !== 'owner') return -1;
      if (a.role !== 'owner' && b.role === 'owner') return 1;
      return 0;
    });

  if (accounts.length === 0) {
    return { success: false, error: 'No valid workspace accounts associated with this profile.' };
  }

  const primaryAccount = accounts[0];
  const targetLeaseTier: UserTier = primaryAccount.plan_name || TIERS.FREE;
  const targetAccountId: string = primaryAccount.id; 

  const issuedAt = Math.floor(Date.now() / 1000);
  const fourteenDaysInSeconds = 14 * 24 * 60 * 60;
    
  const offlineLeaseJwt = await generateOfflineLeaseJwt({
    userId: user.id,
    accountId: targetAccountId,
    tier: targetLeaseTier,
    exp: issuedAt + fourteenDaysInSeconds,
    version: 1
  });

  return {
    success: true,
    payload: {
      token: offlineLeaseJwt,
      redirectUrl: '/dash',
      tier: targetLeaseTier,
      user: userPayload,
      accounts
    }
  };
}