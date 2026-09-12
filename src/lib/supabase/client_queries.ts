import { Database } from '@/lib/tl_utils/database_types'
import { type  AccountContext, type LoginResult, type UserTier, TIERS } from '@/lib/tl_utils/types'
import { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// From a user ID, get me their accounts and roles ///////
export async function fetchUserAccounts(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AccountContext[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select(`
      role,
      can_publish,
      accounts (
        id,
        name,
        plan_name,
        subscription_status,
        is_personal
      )
    `)
    .eq('user_id', userId);

  if (error || !data) {
    console.error("Error executing fetchUserAccounts query:", error);
    throw error || new Error("No membership data returned.");
  }

  // Map and transform raw database join results into client-side AccountContext shapes
  return data
    .map(mem => {
      const acc = Array.isArray(mem.accounts) ? mem.accounts[0] : mem.accounts;
      if (!acc) return null;

      let returnValue = {
        id: acc.id,
        name: acc.name,
        plan_name: (acc.plan_name?.toLowerCase() || 'free') as UserTier,
        subscription_status: acc.subscription_status,
        role: mem.role,
        is_personal: !!acc.is_personal,
        can_publish: mem.can_publish,
      };
      //console.log("ACCOUNTS COLLECTED: ", returnValue, typeof(returnValue));

      return returnValue;
    })
    .filter((acc): acc is AccountContext => acc !== null);
}

// Using 'cache' ensures that if you call this 3 times in 
// one request, it only hits the database ONCE.
export async function getProfileFromUserId (uID:string){
  const supabase = createClient()
  
  const { data: profile } = await supabase
    .from('profiles') // Ensure this matches your table name
    .select('id, full_name, display_name, bio, follow, has_avatar, username, updated_at')
    .eq('id', uID)
    .single()
  return profile;
}


export async function updateProfile(
  userId: string,
  activeAccount: AccountContext,
  updates: { display_name?: string; bio?: string; follow?: string[] }
) {
  const supabase = createClient()

  // 1. Authenticate user session directly
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    throw new Error('Unauthorized: No valid session found.')
  }

  // 2. Prevent user ID spoofing
  if (user.id !== userId) {
    throw new Error('Unauthorized: User ID mismatch.')
  }

  // 3. Authorization check
  if (!activeAccount.can_publish) {
    throw new Error('Forbidden: Publishing privileges required.')
  }

  // 4. Perform update on profiles table ONLY
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()

  if (error) {
    console.error('Error updating profile:', error)
    throw error
  }

  return data
}

// 
export async function checkPublishingPermissions(
  supabase: SupabaseClient<Database>,
  userId: string,
  accountId: string
): Promise<boolean> {
  try {
    const userAccounts = await fetchUserAccounts(supabase, userId)
    const targetAccount = userAccounts.find((acc) => acc.id === accountId)

    if (!targetAccount) return false

    return targetAccount.can_publish
  } catch (err) {
    console.error('Failed to verify publishing permission:', err)
    return false
  }
}