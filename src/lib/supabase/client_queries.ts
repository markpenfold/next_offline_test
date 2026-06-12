import { Database } from '@/lib/database_types'
import { type  AccountContext, type LoginResult, type UserTier, TIERS } from '@/lib/types'
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
        is_personal: !!acc.is_personal
      };
      console.log("ACCOUNTS COLLECTED: ", returnValue, typeof(returnValue));

      return returnValue;
    })
    .filter((acc): acc is AccountContext => acc !== null);
}


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
