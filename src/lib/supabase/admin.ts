// utils/supabase/admin.ts
/// USED TO HANDLE STRIPE WEBHOOK STUFF. 
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database_types'


export async function createAdminClient<Database>(){
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