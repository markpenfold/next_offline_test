import {createBrowserClient} from '@supabase/ssr'
import { Database } from '@/lib/tl_utils/database_types'

// the ssr version of these clients are created
// so you can work between the server and the client
// with cookies readable by both
export function createClient() {
  //console.log("SupabaseBrowserClient")

    return createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            // Optional custom lock override to avoid lock contention
            lock: async (_name, _timeout, fn) => fn(),
          },
        }
    )
}