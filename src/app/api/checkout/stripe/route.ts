import { NextResponse, NextRequest, } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin' // 🛡️ Import your admin utility
import { UserTier } from '@/lib/tl_utils/types'
import { getAccountContext } from '@/lib/supabase/queries'


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-07-29.dahlia"
})

const PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRICE_PRO!,
  team: process.env.STRIPE_PRICE_TEAM!,
  founder: process.env.STRIPE_PRICE_FOUNDER!,
}

// For users already logged into the app upgrading their plan.
export async function POST(request: Request) {
  //console.log("checkout POST Billing modification request received ", request)
  
  try {
    // 1. Extract body variables securely via JSON payload //////////////////////
    const body = await request.json()
    const { plan, activeAccount, seatsRequested } = body
    console.log("inCOMING", plan, activeAccount, seatsRequested)

    // Allow 'free' through even though it doesn't have a Price ID ////////////////////////////
    if (!plan || !PRICE_IDS[plan] && plan !== 'free' || !activeAccount) {
      return NextResponse.json({ error: 'Missing data, please try again.' }, { status: 400 })
    }

    // 2. Validate current user identity parameters ///////////////////////////////
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // This will be the account contect
    // Or null if the user is not the owner
    let accountCtx = await getAccountContext(supabase, user.id, activeAccount)
    // Total fail, go home
    if (!accountCtx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // ATTEMPT STRIPE AUTO-HEAL //////////////////////////////////////////////
    if (!accountCtx.stripeCustomerId) {
      console.log(`[Checkout Security] Missing Stripe ID for user ${user.id}. Running Just-In-Time provisioner...`)
      const supabaseAdmin = await createAdminClient()
      
      let verifiedCustomerId: string;
      let foundSubId: string | null = null
      let foundSubItemId: string | null = null
      let foundSubStatus: string | null = null
      let foundPlanName: string | null = null

      const existingCustomers = await stripe.customers.search({
        query: `email:'${user.email}' AND metadata['account_id']:'${activeAccount}' AND metadata['userId']:'${user.id}'`,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        const customer = existingCustomers.data[0]
        verifiedCustomerId = customer.id;
        console.log(`[Auto-Heal] Existing Stripe customer found (${verifiedCustomerId}). Checking for active subs...`);

        const activeSubs = await stripe.subscriptions.list({
          customer: verifiedCustomerId,
          status: 'active',
          limit: 1
        })

        if (activeSubs.data.length > 0) {
          const stripeSub = activeSubs.data[0]
          foundSubId = stripeSub.id
          foundSubItemId = stripeSub.items.data[0]?.id
          foundSubStatus = stripeSub.status
          foundPlanName = stripeSub.metadata?.planChoice || null
          console.log(`[Auto-Heal] Deep match! Active sub found (${foundSubId}). Preparing cache sync...`)
        } else {
          console.log(`[Auto-Heal] Existing customer (${verifiedCustomerId}) is confirmed on the Free tier.`)
        }

      } else {
        console.log(`[Auto-Heal] No Stripe profile found. Creating fresh customer context...`)
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id, account_id: accountCtx.accountId },
        })
        verifiedCustomerId = customer.id
      }

      await supabaseAdmin
        .from('accounts')
        .update({ 
          stripe_customer_id: verifiedCustomerId,
          stripe_subscription_id: foundSubId,
          stripe_subscription_item_id: foundSubItemId,
          subscription_status: foundSubStatus,
          plan_name: foundPlanName || 'free'
        })
        .eq('id', accountCtx.accountId)

      accountCtx = await getAccountContext(supabase, user.id, activeAccount)
      if (!accountCtx || !accountCtx.stripeCustomerId) {
        return NextResponse.json({ error: 'Billing service unavailable.' }, { status: 503 })
      }
    } // END AUTO HEAL /////////////////////////////////////////

    // LOCAL STATE ASSIGNMENTS (Fixed references using flat camelCase helper object)
    let finalSubscriptionId = accountCtx.stripeSubscriptionId
    let finalSubItemId = accountCtx.stripeSubscriptionItemId
    let finalSubStatus = accountCtx.subscriptionStatus
    const dbPlanName = accountCtx.planName
    // Is this REALLY a paid sub?
    let finalIsPaidSub = dbPlanName && dbPlanName !== 'free' && finalSubscriptionId && (finalSubStatus === 'active' || finalSubStatus === 'trialing');
    // TEAMS: If it's the team plan, force a baseline minimum of 2 seats
    const finalQuantity = plan === 'team' ? Math.max(2, seatsRequested || 2) : 1;


    // DOUBLE CHECK WITH STRIPE ///////////////////////////////////////////////////
    // If the DB thought they were free, but they actually have a valid customer ID, 
    // run a quick direct verification with Stripe before letting them check out.
    if (!finalIsPaidSub && accountCtx.stripeCustomerId) {
      console.log(`[Billing Cache Sync] Local state reports free tier. Syncing live Stripe data...`)
      const liveSubs = await stripe.subscriptions.list({
        customer: accountCtx.stripeCustomerId,
        status: 'active',
        limit: 1
      })

      const existingSubscription = liveSubs.data[0]

      if (existingSubscription && existingSubscription.metadata?.account_id === accountCtx.accountId) {
        console.log(`[Billing Cache Sync] Live active subscription detected (${existingSubscription.id}). Updating local pointers...`)
        
        finalSubscriptionId = existingSubscription.id
        finalSubItemId = existingSubscription.items.data[0]?.id
        finalSubStatus = existingSubscription.status
        finalIsPaidSub = true

        // Async update DB cache in background so next page load is instant
        const supabaseAdmin = await createAdminClient()
        await supabaseAdmin
          .from('accounts')
          .update({
            stripe_subscription_id: existingSubscription.id,
            stripe_subscription_item_id: existingSubscription.items.data[0]?.id,
            subscription_status: existingSubscription.status,
            plan_name: existingSubscription.metadata?.planChoice || plan
          })
          .eq('id', accountCtx.accountId)
      }
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // BRANCH A: DEEP LINK UPDATE PORTAL ///////////////////////////////////////////////////////////////
    // For existing paying customers upgrading, downgrading, or adding seats
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    if (finalIsPaidSub && finalSubscriptionId) {
      console.log(`[Billing Workflow] Active paid subscription found (${finalSubscriptionId}). Generating switch deep link...`)

      if(plan === 'free'){
        // send downgrade signal to stripe reset db
        // if user is owner of a team sub -> Kill all members down to 'free' 
        console.log(`[Billing Workflow] Scheduling downgrade to free for subscription ${finalSubscriptionId}`)

        // 1. Tell Stripe to stop billing them at the end of the current cycle
      const updatedSub = await stripe.subscriptions.update(finalSubscriptionId, {
          cancel_at_period_end: true
        })

        // IS THE CANCELLATION SET?
        console.log(`[Stripe Verification] Is scheduled to cancel? ${updatedSub.cancel_at_period_end}`);
        console.log(`[Stripe Verification] True expiration date: ${new Date(updatedSub.cancel_at! * 1000).toLocaleDateString()}`);

        // 2. Clear out your local "paid_plan" ledger record if desired, or let the webhook handle it.
        // We return early so they never hit the Stripe Billing Portal generation code below.
        return NextResponse.json({ 
          success: true, 
          url: '/dash?update=success', 
          message: 'Your subscription will remain active until the end of your billing period, then cascade to the free tier.' 
        })
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: accountCtx.stripeCustomerId!,
        flow_data: {
          type: 'subscription_update_confirm',
          subscription_update_confirm: {
            subscription: finalSubscriptionId,
            items: [{
              id: finalSubItemId!,       // This MUST be the subscription ITEM ID (si_...)
              price: PRICE_IDS[plan],   // The new Price ID goes here
              quantity: finalQuantity,
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

    ////////////////////////////////////////////////////////////////////////////////////////////////////
    // BRANCH B: COLD CALLER CHECKOUT //////////////////////////////////////////////////////////////////
    // For Free tier users or new signups going premium for the first time
    ////////////////////////////////////////////////////////////////////////////////////////////////////
    console.log(`[Billing Workflow] No active paid subscription found. Generating fresh checkout form...`)
    
    if (!accountCtx.accountId) {
      throw new Error("[Billing Workflow] Denied checkout: Missing target workspace accountId identifier.");
    }

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: accountCtx.stripeCustomerId!, 
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: PRICE_IDS[plan], quantity: finalQuantity }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dash?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing?canceled=true`,
      metadata: { planChoice: plan, userId: user.id, account_id: accountCtx.accountId }, 
      subscription_data: { metadata: { planChoice: plan, userId: user.id, account_id: accountCtx.accountId } }
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
    // User should have been created by SignUp Action
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

    // If a fresh signup hasn't had their workspace generated yet,
    // Send them to failure url
    // Could also add an await here?
    if (dbError || !accountId) {
      console.warn(`[Checkout Warning] No workspace found for user ${targetUserId}. Falling back to default routing context.`);
      return NextResponse.redirect(new URL('/sign-up-error?error=invalid_plan', req.url))
    }

    // Enforce 2 seat floor on team setups
    const finalQuantity = plan === 'team' ? 2 : 1

    // 3. Construct the Stripe Checkout Session
    // https://docs.stripe.com/api/checkout/sessions/object?api-version=2026-05-27.preview&rds=1
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      
      // If returning user, link their customer account. If fresh signup, pass their email.
      customer: stripeCustomerId || undefined,
      customer_email: stripeCustomerId ? undefined : targetEmail,
      client_reference_id: targetUserId,

      line_items: [{ price: priceId, quantity: finalQuantity }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dash?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing`,
      
      metadata: {
        userId: targetUserId,
        account_id: accountId , // 🎯 Tells webhook to build a workspace if missing!
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