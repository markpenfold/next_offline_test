// 📄 src/actions/auth.ts
'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { type SupabaseClient, type User } from '@supabase/supabase-js';
import { type LoginResult,  ActionState  } from '@/lib/tl_utils/types'
import { redirect } from 'next/navigation'
import { updatePasswordSchema, forgotPasswordSchema, signUpSchema, type SignUpPayload } from "@/lib/validations/primitives";
import { headers } from 'next/headers'
import { generateUserSessionPayload } from '@/lib/supabase/queries'
import { Database } from '@/lib/tl_utils/database_types'
import { setUpStripeCustomer, getActiveUserAccount } from '@/lib/supabase/queries';

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

  // 2. Query supabase for details
  const [profileResult, membershipsResult] = await getUserDetails(authData.user, supabase);

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


export async function organicSignup(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  const rawData = Object.fromEntries(formData)

  // 1. Validate organic signup payload ////////////////
  const validatedFields = signUpSchema.safeParse(rawData)
  if (!validatedFields.success) {
    return { error: validatedFields.error.issues[0].message }
  }

// Add new user to Supabase ////////////////////////
// This triggers the resend confirm email ///////////////
// From that email the user will be sent to the auth/callback endpoint 
const authResult = await createSupabaseUser(validatedFields.data)
if (!authResult.success) {
  return { error: authResult.error }
}

// get user id from the auth setup
const { userId } = authResult

/// NOW CREATE STRIPE ACCOUNT OR GRAB EXISTING ONE FOR CUSTOMER //////////
try {
    // grab the account we just created in supabase
    const accountData = await getActiveUserAccount(userId)
    const accountId = accountData?.account_id

    if (accountId) {
      // now we create a stripe account ready for them to use to pay
      // at this point it has been added to the accounts table
      const newStripeId = await setUpStripeCustomer(accountId, userId)
      console.log(`Mapped Stripe Customer ${newStripeId} to account ${accountId}`)
    } else {
      console.warn(`Could not resolve new accountId for user ${userId}; Stripe provisioning deferred to callback.`)
    }
  } catch (stripeError: any) {
    // Non-blocking: /auth/callback and /api/checkout/stripe auto-heal this if transient
    console.error('Stripe customer provisioning deferred:', stripeError.message)
  }

  // 4. Gate /confirm and redirect
  // Sets a Temporary Permission Cookie (allow_confirm: true):
  const cookieStore = await cookies()
  cookieStore.set('allow_confirm', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  })

  cookieStore.set('confirm_name', validatedFields.data.full_name, {
    httpOnly: false, // Set to false if you want client components to read it directly, or keep true if only reading on the server
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  })

  redirect('/confirm')
}


export async function requestPasswordReset(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  console.log('Server received email:', email); // Check your terminal for this!
  const supabase = await createClient()
  // Get the site URL dynamically so it works in localhost and production
 // 1. Get host directly (e.g. "localhost:3000")
  const headerList = await headers()
  const host = headerList.get('host') 
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https'

  // 2. Build explicit origin
  const origin = `${protocol}://${host}`
  const validated = forgotPasswordSchema.safeParse({ email: email });

  //local zod test for input failed so...
  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  console.log('Sending reset link with redirectTo:', `${origin}/auth/callback?next=/update-password`)

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
  // Do NOT call redirect('/dash') here!
  return { success: true }
}


// 1. Define a type helper for the profiles query response
type ProfileResponse = Database['public']['Tables']['profiles']['Row'];

async function getUserDetails(user: User, supabase: SupabaseClient<Database>)
{
  // CONCURRENT PIPELINE: Run both queries in parallel
  const [profileResult, membershipsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, email, full_name, display_name, bio, has_avatar, avatar_url ')
      .eq('id', user.id)
      .single(),
      
    supabase
          .from('memberships')
          .select('account_id, role, can_publish, accounts(id, name, plan_name, subscription_status, is_personal, account_slug, blog_title, blog_subtitle )')
          .eq('user_id', user.id)
      ]);

  // NO hardcoded return type signature in the function header!
  // TypeScript will automatically infer the exact, perfectly accurate return shape
  // Because we have imported the db schema from Supabase => SupabaseClient<Database>
  return [profileResult, membershipsResult] as const;

}



/// HELPERS
interface CreateSupabaseUserInput {
  email: string
  password: string
  metadata: {
    full_name: string
    username: string
    account_name: string
    blog_name: string
    blog_slug: string
    pending_plan?: string
    parent_account_id?: string
  }
}

type CreateSupabaseUserResult =
  | { success: true; userId: string }
  | { success: false; error: string }

// 2. Create Auth user (Postgres trigger creates profile + 'free'/'active' personal account)
async function createSupabaseUser(
  data: SignUpPayload,
  extraMetadata: Record<string, string> = {}
): Promise<CreateSupabaseUserResult> {
  const supabase = await createClient()

  const headerList = await headers()
  const host = headerList.get('host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const siteUrl = host ? `${protocol}://${host}` : process.env.NEXT_PUBLIC_SITE_URL

  const { data: signUpData, error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
      data: {
        full_name: data.full_name,
        username: data.username,
        account_name: data.account_name,
        pending_plan: data.planChoice || 'free',
        blog_name: data.blog_title?.trim() || data.account_name,
        blog_slug: data.blog_slug,
        ...extraMetadata,
      },
    },
  })

  if (error) {
    console.error('Supabase Signup Error:', error.message)
    const msg = error.message.toLowerCase()

    if (msg.includes('database error saving new user') || msg.includes('unique constraint')) {
      if (msg.includes('username')) return {success: false, error: 'That username is already taken. Please choose another.' }
      if (msg.includes('account_slug') || msg.includes('blog_slug')) return {success: false, error: 'That blog URL is already taken.' }
      if (msg.includes('name')) return {success: false, error: 'That account name is already in use.' }
      return {success: false, error: 'A profile detail (username, account, or URL) is already in use.' }
    }

    if (msg.includes('user already registered')) {
      return {success: false, error: 'An account with this email already exists.' }
    }

    return {success: false, error: error.message }
  }

  if (!signUpData.user?.id) {
    return {success: false, error: 'Registration failed to initialize user.' }
  }

  return {success: true, userId: signUpData.user.id }
}



//// JUST HERE TILL WE GET AROUND TO WRITING THE INVITE PATH ////////////////
export async function invitedSignup(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  const rawData = Object.fromEntries(formData)

  // 1. Validate organic signup payload ////////////////
  const validatedFields = signUpSchema.safeParse(rawData)
  if (!validatedFields.success) {
    return { error: validatedFields.error.issues[0].message }
  }

/// Add new user to Supabase ////////////////////////
const authResult = await createSupabaseUser(validatedFields.data)
if (!authResult.success) {
  return { error: authResult.error }
}

// get user id from the auth setup
const { userId } = authResult

/// NOW CREATE STRIPE ACCOUNT OR GRAB EXISTING ONE FOR CUSTOMER //////////
try {
    // grab the account we just created in supabase
    const accountData = await getActiveUserAccount(userId)
    const accountId = accountData?.account_id

    if (accountId) {
      // now we create a stripe account ready for them to use to pay
      // at this point it has been added to the accounts table
      const newStripeId = await setUpStripeCustomer(accountId, userId)
      console.log(`Mapped Stripe Customer ${newStripeId} to account ${accountId}`)
    } else {
      console.warn(`Could not resolve new accountId for user ${userId}; Stripe provisioning deferred to callback.`)
    }
  } catch (stripeError: any) {
    // Non-blocking: /auth/callback and /api/checkout/stripe auto-heal this if transient
    console.error('Stripe customer provisioning deferred:', stripeError.message)
  }

  // 4. Gate /confirm and redirect
  // Sets a Temporary Permission Cookie (allow_confirm: true):
  const cookieStore = await cookies()
  cookieStore.set('allow_confirm', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  })

  cookieStore.set('confirm_name', validatedFields.data.full_name, {
    httpOnly: false, // Set to false if you want client components to read it directly, or keep true if only reading on the server
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  })

  redirect('/confirm')
}