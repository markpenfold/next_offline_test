// utils/supabase/admin.ts
/// USED TO HANDLE STRIPE WEBHOOK STUFF. 
import { createClient } from '@supabase/supabase-js'

export async function createAdminClient(){
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!, // This is the secret one!
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}