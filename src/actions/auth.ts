// src/actions/auth.ts
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updatePasswordSchema } from "@/lib/validations/primitives";
import { headers } from 'next/headers'
import { forgotPasswordSchema } from "@/lib/validations/primitives";
import { generateOfflineLeaseJwt } from '@/lib/auth/crypto';




export async function login(formData: FormData) {
    const cookieStore = await cookies()
    const supabase = await createClient()
  
    // 1. Authenticate with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    })
  
    if (error || !data.user) {
      return { error: 'Invalid credentials' }
    }

    // all worked ok then get user from returned data
    const user = data.user;


    // 3 & 4 Combined: Fetch Profile, Memberships, and Accounts in one shot
    const { data: userRecord, error: fetchError } = await supabase
      .from('profiles')
      .select(`
        *,
        memberships (
          account_id,
          role,
          accounts (
            id,
            name,
            slug
          )
        )
      `)
      .eq('id', user.id)
      .single()

    if (fetchError || !userRecord) {
      return { error: 'Failed to retrieve user data' }
    }

    // Destructure the result to keep the rest of your logic exactly the same
    const { memberships = [], ...profile } = userRecord

    
    // Comprehensive Guard Clause (Safe from crashing)
    // If it's null or empty, handle it and exit.
    if (!memberships || memberships.length === 0 || memberships[0]?.account_id === null) {
      redirect('/signup')
    }

    // SMART ROUTING WITH MEM COUNT
    const mem_count = memberships.length || 0
    const isSingleAccount = mem_count === 1
    const firstAccountId = memberships[0].account_id
    const redirectUrl = isSingleAccount ? `/dashboard/${firstAccountId}` : '/dashboard'

    // 5. 🔐 Generate the Cryptographic Subscription Lease
    const currentTier = profile?.tier || 'free'
    const offlineLeaseJwt = await generateOfflineLeaseJwt({
      userId: user.id,
      tier: currentTier,
      version: 1
    })


    // 6. Bake Server Context Cookie (For Middleware / SSR page loads)
    cookieStore.set('user_workspace_context', JSON.stringify({
      count: mem_count,
      defaultId: isSingleAccount ? firstAccountId : null 
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    })

    console.log("sending them to:", redirectUrl)
    // 7. Return the Complete Offline Hydration Kit to the Browser
    return {
      
      success: true,
      redirectUrl,
      payload: {
        user,
        profile,
        memberships,
        offlineLeaseJwt
      }
  }
}