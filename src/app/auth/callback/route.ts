import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  
  // SECURITY Strictly sanitize the redirect path to prevent open redirects
  let next = searchParams.get('next') || '/dash'
  if (!next.startsWith('/') || next.startsWith('//')) {
    console.log("OH DEAR, what is wrong with the redirect?")
    next = '/dash'
  }
  
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // No code present? Get out early.
  if (!code) {
    return NextResponse.redirect(new URL('/auth/auth-code-error', siteUrl).toString())
  }

  // Alright, we have a code from the user, let's go!
  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  // Got an error or missing user? Get out early.
  if (error || !data?.user) {
    return NextResponse.redirect(new URL('/auth/auth-code-error', siteUrl).toString())
  }
    
    // SUCCESS PATH
  const user = data.user

  // CATCH PASSWORD RESETS HERE AND SEND TO update page
  // Keeping session active
  if (next === '/update-password') {
    return NextResponse.redirect(new URL(next, siteUrl).toString())
  }


  const supabaseAdmin = await createAdminClient()
  
  //Background Provisioning: Safe to execute because we have the verified user object
  try {
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('account_id, accounts(stripe_customer_id)')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .single<{ account_id: string; accounts: { stripe_customer_id: string | null } }>()

    const currentAccountId = membership?.account_id
    
    const existingStripeId = membership?.accounts?.stripe_customer_id
    
    // Set stripe ID if not already done 
    if (currentAccountId && !existingStripeId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
        }, {
        idempotencyKey: `customer_create_${user.id}`,
      })
      await supabaseAdmin
        .from('accounts')
        .update({ stripe_customer_id: customer.id })
        .eq('id', currentAccountId)
    }
  } catch (stripeErr) {
    console.error('Non-blocking provisioning warning:', stripeErr)
  }

  // Final happy-path redirect
  const pendingPlan = user?.user_metadata?.pending_plan

  // PATH A:IF THEY CHOSE A PAID PLAN, SEND THEM TO STRIPE CHECKOUT INSTEAD OF THE DASHBOARD
  if (pendingPlan && pendingPlan !== 'free') {
    const checkoutUrl = new URL('/api/checkout/stripe', siteUrl)
    checkoutUrl.searchParams.set('plan', pendingPlan)
    checkoutUrl.searchParams.set('userId', user.id)
    if (user.email) checkoutUrl.searchParams.set('email', user.email)
    
    return NextResponse.redirect(checkoutUrl.toString())
  }

  // 🟢 PATH B: FREE PLAN / STANDARD SIGNUP CONFIRMATION
  // Wipe out the auto-authenticated server session cookie completely.
  // This guarantees they are forced through your dedicated LoginForm entry point.
  await supabase.auth.signOut()

  // Assemble the destination login URL, carrying forward the success parameters
  const loginRedirectUrl = new URL('/login', siteUrl)
  loginRedirectUrl.searchParams.set('verified', 'true')

  // If they were trying to deep-link somewhere specific, preserve it!
  if (next && next !== '/dash') {
    loginRedirectUrl.searchParams.set('next', next)
  }

  return NextResponse.redirect(loginRedirectUrl.toString())
  
}