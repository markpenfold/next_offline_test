import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'
import {createAdminClient} from '@/lib/supabase/admin'

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

export async function getAccountByStripeId( customerId: string) {
  if (!customerId) return null
  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('accounts')
    .select('id, plan_name, stripe_subscription_id, paid_plan')
    .eq('stripe_customer_id', customerId)
    .single()

  
  if (error) {
    // Supabase throws an error if .single() finds 0 rows, 
    // so we catch it gracefully without breaking the app.
    console.warn(`[Queries] No account found for Stripe ID ${customerId}:`, error.message)
    return null
  }
  const user_id = await getAccountOwnerId(data?.id)

  return { ...data, user_id }
}

export async function getAccountOwnerId(accountId:string): Promise<string | null> {
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
    console.error(`[Query Error] No owner found for account ${accountId}`, memError?.message)
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
    console.error(`[Query Error] No owner found for account ${accountId}`, memError?.message)
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