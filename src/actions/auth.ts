// 📄 src/actions/auth.ts
'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { generateOfflineLeaseJwt } from '@/lib/auth/crypto'
import { type UserTier, TIERS } from '@/lib/types'
import { type PostgrestSingleResponse, type PostgrestResponse } from '@supabase/supabase-js';
import { type SupabaseClient, type User } from '@supabase/supabase-js';
import { type LoginResult, AccountContext, ProfileRecord, MembershipRecord, ActionState  } from '@/lib/types'
import { redirect } from 'next/navigation'
import { updatePasswordSchema, forgotPasswordSchema } from "@/lib/validations/primitives";
import { headers } from 'next/headers'
import { signUpSchema } from '@/lib/validations/primitives'
import { generateUserSessionPayload } from '@/lib/supabase/queries'

export async function login(formData: FormData): Promise<LoginResult> {
  
  console.log("login")
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


  // 2. Query supabase for details
  const [profileResult, membershipsResult] = await getUserDetails(user, supabase);
  
  // 3. Delegate the entire payload generation and validation to an external function
  return await generateUserSessionPayload(authData.user, profileResult, membershipsResult);
}


export async function refreshSession() {
  const supabase = await createClient()
  
  // 1. Get the current logged-in user session
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { success: false, error: "Not authenticated" }
  }

  // 2. Query the database for the newly updated Stripe details
  const [profileResult, membershipsResult] = await getUserDetails(user, supabase)

  // 3. Run it through your external function to get the fresh JWT and payload
  return await generateUserSessionPayload(user, profileResult, membershipsResult)
}


export async function logout() {
  const cookieStore = await cookies()
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}


export async function signup(prevState: ActionState, formData: FormData): Promise<ActionState> {

 
  const rawData = Object.fromEntries(formData)
  console.log("rawData:", rawData)
  
  const result = signUpSchema.safeParse(rawData)
  if (!result.success) {
     const firstIssue = result.error.issues[0]
    return { error: `${String(firstIssue.path[0])}: ${firstIssue.message}` }  }
  // Now destructure from result.data instead of formData directly
  const { email, password, full_name, username, account_name, planChoice, invite_token } = result.data



  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  let verifiedParentAccountId: string | null = null

  // SECURITY CHECK: If joining a team, validate the token first
  if (invite_token) {
    const { data: invite, error: inviteError } = await supabase
      .from('invitations')
      .select('account_id, email, expires_at, accepted')
      .eq('id', invite_token)
      .single()

    // 1. Check if token exists or has already been used
    if (inviteError || !invite || invite.accepted) {
      return { error: "This invitation is invalid or has already been used." }
    }

    // 2. Check if the token has expired
    if (new Date(invite.expires_at) < new Date()) {
      return { error: "This invitation has expired. Please ask your admin for a new link." }
    }

    // 3. Prevent Email Hijacking: Ensure they are signing up with the invited email
    if (invite.email.toLowerCase() !== email) {
      return { error: "This invitation was sent to a different email address." }
    }

    // Secure token passes validation. Fetch the true account ID from the DB.
    verifiedParentAccountId = invite.account_id
  }

  // Execute standard Supabase signup
  const { error } = await supabase.auth.signUp({ 
    email, 
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?plan=${planChoice}`,
      data: {
        full_name,
        username,
        account_name,
        pending_plan: planChoice,
        // Pass the backend-verified ID straight to your existing Postgres trigger!
        parent_account_id: verifiedParentAccountId 
      }
    }
  })

  if (error) return { error: error.message };

  // just in time cookies
  const cookieStore = await cookies()
  cookieStore.set('allow_confirm', 'true', {
    maxAge: 600, 
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })

  redirect('/confirm');
}


export async function requestPasswordReset(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const supabase = await createClient()
  // Get the site URL dynamically so it works in localhost and production
  const origin = (await headers()).get('origin')

  const validated = forgotPasswordSchema.safeParse({ email: email });

  //local zod test for input failed so...
  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  // now send to supabase, and await return value
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // This tells Supabase where to send the user after they click the email link
    redirectTo: `${origin}/auth/callback?next=/update-password`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: "Check your email for the reset link!" }
}


export async function resetPassword(prevState: ActionState, formData: FormData) {

  const supabase = await createClient()

  // 1. Convert all form fields to an object for Zod
  const rawData = Object.fromEntries(formData)
  // 2. Validate against the schema (this checks password + confirmation match)
  const validated = updatePasswordSchema.safeParse(rawData)

  if (!validated.success) {
    // Return Zod issue if validation fails
    return { error: validated.error.issues[0].message };
  }


  // 3. Supabase only needs the validated password
  const { error } = await supabase.auth.updateUser({
    password: validated.data.password
  })

  if (error) return { error: error.message }
  
  // Redirect to login or profile after success
  redirect('/login?message=Password updated successfully')
}




async function getUserDetails(user: User, 
  supabase: SupabaseClient
): Promise<[
  PostgrestSingleResponse<ProfileRecord>, 
  PostgrestResponse<MembershipRecord>
]>{

  // CONCURRENT PIPELINE: Run both queries in parallel
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

  return [profileResult, membershipsResult];

}