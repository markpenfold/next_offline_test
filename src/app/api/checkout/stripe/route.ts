import { NextResponse, NextRequest, } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UserTier } from '@/lib/tl_utils/types'
import { getAccountContext } from '@/lib/supabase/queries'
import { STRIPE_API_VERSION } from "@/lib/utils/stripeConfig";
import { setUpStripeCustomer } from '@/lib/supabase/queries'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: STRIPE_API_VERSION
})

const PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRICE_PRO!,
  team: process.env.STRIPE_PRICE_TEAM!,
  founder: process.env.STRIPE_PRICE_FOUNDER!,
}


// ALREADY LOGGED IN = CHANGING PLAN

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


// FOR FRESH ORGANIC SIGNUPS //////////////////////////
// Incoming from signup-> confirm email -> callback ///
// searchparams set with userId and plan //////////////
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const plan = searchParams.get('plan') as UserTier | null
    const urlUserId = searchParams.get('userId')

    if (!plan || plan === 'free') {
      return NextResponse.redirect(new URL('/dash?message=Welcome!', req.url))
    }

    const priceId = PRICE_IDS[plan]
    if (!priceId) {
      return NextResponse.redirect(new URL('/pricing?error=invalid_plan', req.url))
    }

    // 1. Resolve Identity from session or query param fallback
    const supabase = await createClient()
    const { data: { user: sessionUser } } = await supabase.auth.getUser()
    const targetUserId = sessionUser?.id || urlUserId

    if (!targetUserId) {
      console.error("[Checkout Error] No identity anchor found. Blocking anonymous request.")
      return NextResponse.redirect(new URL('/pricing?error=session_expired', req.url))
    }

    // 2. Fetch the user's single owned account via admin client for reliability
    const supabaseAdmin = await createAdminClient()
    const { data: membership, error: dbError } = await supabaseAdmin
      .from('memberships')
      .select('account_id')
      .eq('user_id', targetUserId)
      .eq('role', 'owner')
      .maybeSingle()

    if (dbError || !membership?.account_id) {
      console.error(`[Checkout Error] No owned workspace found for user ${targetUserId}.`)
      return NextResponse.redirect(new URL('/sign-up-error?error=no_workspace', req.url))
    }

    const accountId = membership.account_id

    // 3. Ensure Stripe customer is fully provisioned using your shared helper
    let stripeCustomerId: string
    try {
      stripeCustomerId = await setUpStripeCustomer(accountId, targetUserId)
    } catch (stripeErr: any) {
      console.error('[Checkout Error] Failed to auto-provision Stripe customer:', stripeErr.message)
      return NextResponse.redirect(new URL('/sign-up-error?error=billing_init_fail', req.url))
    }

    // 4. Enforce 2-seat floor for team plans
    const finalQuantity = plan === 'team' ? 2 : 1

    // 5. Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: finalQuantity }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dash?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing?canceled=true`,
      metadata: { 
        planChoice: plan, 
        userId: targetUserId, 
        account_id: accountId 
      },
      subscription_data: { 
        metadata: { 
          planChoice: plan, 
          userId: targetUserId, 
          account_id: accountId 
        } 
      }
    })

    return NextResponse.redirect(new URL(session.url!))

  } catch (error: any) {
    console.error('Stripe GET redirect session fatal runtime error:', error)
    return NextResponse.redirect(new URL('/dash?error=stripe_fail', req.url))
  }
}