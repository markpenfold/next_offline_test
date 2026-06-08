// src/lib/supabase/server.ts
/*
This is a local utility function. 
Its only job is to wrap createServerClient
Makes talking to your database one line.
It "pre-fills" the URL, the Key, and the cookie logic.
*/
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database_types'

export async function createClient() {

 // console.log("SupabaseServerClient")
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet, _headers) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
      auth: {
        detectSessionInUrl: false,
        persistSession: true,
      }
    }
    
  )

}