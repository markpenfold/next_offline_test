import { NextResponse, NextRequest, } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin' // 🛡️ Import your admin utility

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia"
})

const PRICE_IDS: Record<string, string> = {
  standard: process.env.STRIPE_PRICE_STANDARD!,
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
    const { plan } = body

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

    // 4. Construct safe configuration payload mapping rules
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: stripeCustomerId, 
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dash?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing?canceled=true`,
      metadata: { planChoice: plan,  userId: user.id, account_id:accountId}, // Useful for tracking the overall Checkout Session object
      subscription_data: { metadata: { planChoice: plan, userId: user.id } }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    // Return the URL as a clean JSON response instead of a forced HTTP 303 redirect
    return NextResponse.json({ url: session.url })

  } catch (err: any) {
    console.error('Checkout routing failure:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    // Extract parameters from the incoming URL string
    const { searchParams } = new URL(req.url)
    const plan = searchParams.get('plan')
    const userId = searchParams.get('userId')
    const email = searchParams.get('email')

    if (!plan || !userId) {
        return NextResponse.redirect(new URL('/pricing?error=session_expired', req.url))    }

    if(plan === 'free'){
      console.log("At the checkout asking for a free space")
      return NextResponse.redirect(new URL('/dash?message=Welcome to your Free workspace!', req.url))
    }
    // Map your incoming text plan to your actual Stripe Price IDs
    const priceMap: Record<string, string> = {
      standard: process.env.STRIPE_PRICE_STANDARD!,
      pro: process.env.STRIPE_PRICE_PRO!,  
      team: process.env.STRIPE_PRICE_TEAM!,
      founder: process.env.STRIPE_PRICE_FOUNDER!,
    }

    const priceId = priceMap[plan]

    if (!priceId) {
      return NextResponse.redirect(new URL('/dash?error=invalid_plan', req.url))
    }

    // Create the Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dash?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing`,
      metadata: {
        userId: userId,
        planName: plan
      },
      // 2. Subscription Metadata (For recurring payments and safety net)
      subscription_data: {
        metadata: {
          userId: userId,
          plan: plan // 👈 Stops your kill-switch from panicking!
        }
      },
    })

    // Safely redirect the browser directly to Stripe's secure checkout page
    return NextResponse.redirect(session.url!)

  } catch (error: any) {
    console.log('Stripe GET redirect session error:', error)
    return NextResponse.redirect(new URL('/dash?error=stripe_fail', req.url))
  }
}