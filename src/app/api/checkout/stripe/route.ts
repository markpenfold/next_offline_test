import { NextResponse, NextRequest, } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin' // 🛡️ Import your admin utility
import { UserTier } from '@/lib/types'


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia"
})

const PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRICE_PRO!,
  team: process.env.STRIPE_PRICE_TEAM!,
  founder: process.env.STRIPE_PRICE_FOUNDER!,
}

/**
 * POST ENDPOINT: Internal Upgrades
 * For users already logged into the app upgrading their plan.
 */

export async function POST(request: Request) {
  try {
    // 1. Extract body variables securely via JSON payload
    const body = await request.json()
    const { plan, seatsRequested } = body

    if (!plan || !PRICE_IDS[plan]) {
      return NextResponse.json({ error: 'Invalid plan choice.' }, { status: 400 })
    }

    // 2. Validate current session identity parameters
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }



    // Fetch workspace parameters mapping structures
    const { data: membership } = await supabase
      .from('memberships')
      .select('account_id, accounts(stripe_customer_id)')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .single()

    let stripeCustomerId = (membership?.accounts as any)?.stripe_customer_id
    const accountId = membership?.account_id

    // 3. AUTO-HEAL INTERCEPTOR (Requires Admin Bypass Access)
    if (!stripeCustomerId && accountId) {
      console.log(`[Checkout Security] Missing Stripe ID for user ${user.id}. Running Just-In-Time provisioner...`)
      
      const supabaseAdmin = await createAdminClient()
      const existingCustomers = await stripe.customers.list({ email: user.email, limit: 1 })
      
      if (existingCustomers.data.length > 0) {
        stripeCustomerId = existingCustomers.data[0].id
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id, account_id: accountId},
        })
        stripeCustomerId = customer.id
      }

      //Uses Admin Client to update system identity details seamlessly
      await supabaseAdmin
        .from('accounts')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', accountId)
    }

    if (!stripeCustomerId) {
      return NextResponse.json({ error: 'Billing service unavailable. Please reload.' }, { status: 503 })
    }

    // RULE: If it's the team plan, force a baseline minimum of 2 seats
    const finalQuantity = plan === 'team' ? Math.max(2, seatsRequested || 2) : 1;


    // BRANCH CHECK: Look for an existing active subscription
    const activeSubs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
      limit: 1
    })

    const existingSubscription = activeSubs.data[0]
    // Check if the active subscription is actually a PAID plan
    // We do this by verifying if the subscription's current Price ID exists in our paid PRICE_IDS record
    const currentPriceId = existingSubscription?.items.data[0]?.price.id
    const isPaidSub = currentPriceId && Object.values(PRICE_IDS).includes(currentPriceId)


    // BRANCH A: DEEP LINK UPDATE PORTAL ///////////////////////////////////////////////////////////////
    // For existing paying customers upgrading/switching
    if (existingSubscription && isPaidSub) {
    console.log(`[Billing Workflow] Active paid subscription found (${existingSubscription.id}). Generating switch deep link...`)

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      flow_data: {
        type: 'subscription_update_confirm',
        subscription_update_confirm: {
          subscription: existingSubscription.id,
          items: [{
            quantity: finalQuantity,
            id:PRICE_IDS[plan],
          }]
        },
        after_completion: {
          type: 'redirect',
          redirect: {
            return_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dash?update=success`,
          }
        }
      }
    })

  return NextResponse.json({ url: portalSession.url })
}

  // BRANCH B: COLD INITIAL CHECKOUT (For Free tier users or new signups)
  console.log(`[Billing Workflow] No active paid subscription found. Generating fresh checkout form...`)
  
  //BREAK HERE if we don't know the user's account ///////////////////////////////////////////////////////
  if (!accountId) {
  throw new Error("[Billing Workflow] Denied checkout: Missing target workspace accountId identifier.");
}
  /* PREP INSTRUCTIONS FOR STRIPE /////////////////////////////////////////////////////////////////////////
  1. line_items: what to sell and how much to charge 

  2. mode: 'subscription': Instructs Stripe's billing engine to create a recurring invoice schedule 
    rather than treating it as a one-off purchase (like a t-shirt).

  3. success_url & cancel_url: where to automatically redirect the user's browser 
    once they either complete the payment or click the "Back" button.

  4. metadata: This is the custom cargo hold. 
    Stripe completely ignores this data during processing, 
    but stores it tightly bound to the transaction. 
    When the invoice clears, Stripe ships this exact metadata bundle back to your backend webhooks 
    so your database can safely grant access to the correct workspace. *///////////////////////////
    ///////////////////////////////////////////////////////////////////////////////////////////////

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    customer: stripeCustomerId, 
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: PRICE_IDS[plan], quantity: finalQuantity }],
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dash?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing?canceled=true`,
    metadata: { planChoice: plan, userId: user.id, account_id: accountId  }, 
    subscription_data: { metadata: { planChoice: plan, userId: user.id, account_id: accountId} }
  }

  const session = await stripe.checkout.sessions.create(sessionConfig)
  return NextResponse.json({ url: session.url })

  } catch (err: any) {
    console.error('Checkout routing failure:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}


// FOR FRESH SIGN UPS //////////////////////////
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const plan = searchParams.get('plan') as UserTier | null
    const urlUserId = searchParams.get('userId')
    const urlEmail = searchParams.get('email')

    if (!plan) {
      return NextResponse.redirect(new URL('/pricing?error=invalid_plan', req.url))
    }

    if (plan === 'free') {
      return NextResponse.redirect(new URL('/dash?message=Welcome to your Free workspace!', req.url))
    }

    // 1. Resolve Identity (Session Cookie vs. URL Fallback)
    const supabase = await createClient()
    const { data: { user: sessionUser } } = await supabase.auth.getUser()
    
    // Use the secure session ID if available; otherwise, fall back to the onboarding URL param
    const targetUserId = sessionUser?.id || urlUserId
    const targetEmail = sessionUser?.email || urlEmail || undefined

    if (!targetUserId) {
      console.error("[Checkout Error] No identity anchor found. Blocking anonymous request.")
      return NextResponse.redirect(new URL('/pricing?error=session_expired', req.url))
    }

    // Map plan strings to Stripe Price IDs
    const priceMap: Record<UserTier, string | undefined> = {
      pro: process.env.STRIPE_PRICE_PRO,  
      team: process.env.STRIPE_PRICE_TEAM,
      founder: process.env.STRIPE_PRICE_FOUNDER,
      free: undefined,
      none: undefined
    }

    const priceId = priceMap[plan]
    if (!priceId) {
      return NextResponse.redirect(new URL('/dash?error=invalid_plan', req.url))
    }

    // 2. Fetch Workspace Account Data using our verified Target User ID
    // Using supabase.auth.admin or standard client depending on your RLS policies for unauthenticated reads
    const { data: membership, error: dbError } = await supabase
      .from('memberships')
      .select(`
        account_id,
        accounts (
          stripe_customer_id
        )
      `)
      .eq('user_id', targetUserId)
      .maybeSingle()

    const accountContext = Array.isArray(membership?.accounts) ? membership.accounts[0] : membership?.accounts
    const accountId = membership?.account_id
    const stripeCustomerId = accountContext?.stripe_customer_id

    // 🛡️ Webhook Safety Net: If a fresh signup hasn't had their workspace generated yet,
    // we must pass a temporary flag or halt so the webhook doesn't fail silently.
    if (dbError || !accountId) {
      console.warn(`[Checkout Warning] No workspace found for user ${targetUserId}. Falling back to default routing context.`);
    }

    // Enforce 2 seat floor on team setups
    const finalQuantity = plan === 'team' ? 2 : 1

    // 3. Construct the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      
      // If returning user, link their customer account. If fresh signup, pass their email.
      customer: stripeCustomerId || undefined,
      customer_email: stripeCustomerId ? undefined : targetEmail,
      
      line_items: [{ price: priceId, quantity: finalQuantity }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dash?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing`,
      
      metadata: {
        userId: targetUserId,
        account_id: accountId || 'PENDING_ONBOARDING', // 🎯 Tells webhook to build a workspace if missing!
        plan_name: plan
      },
      
      subscription_data: {
        metadata: {
          userId: targetUserId,
          account_id: accountId || 'PENDING_ONBOARDING',
          plan_name: plan
        }
      },
    })

    return NextResponse.redirect(new URL(session.url!))

  } catch (error: any) {
    console.error('Stripe GET redirect session fatal runtime error:', error)
    return NextResponse.redirect(new URL('/dash?error=stripe_fail', req.url))
  }
}