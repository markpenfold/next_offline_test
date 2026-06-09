import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAccountByStripeId } from '@/lib/supabase/queries'
import {createAdminClient} from '@/lib/supabase/admin'
import { SupabaseClient } from '@supabase/supabase-js'


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
});

// 📄 Place this helper mapping at the top of your file outside the functions
const getPlanFromPriceId = (priceId: string): string => {
  if (priceId === process.env.STRIPE_PRICE_FOUNDER) return 'founder';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_TEAM) return 'team';
  return 'free';
};

/******************************************************
 * Main switch board for incoming stripe processes.
 ********************************************************/
export async function POST(req: Request) {
  console.log("incoming request to POST:", req)
  const body = await req.text();
  const signature = (await headers()).get('Stripe-Signature') as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // =========================================================
  // GLOBAL DEFENSIVE GUARD: EARLY EXIT IF CUSTOMER IS DELETED
  // =========================================================
  if (isCustomerDeleted(event)) {
    console.warn(`[Webhook Intercept] Aborted processing for ${event.type} because target customer was deleted.`);
    return NextResponse.json({ received: true, note: "Ignored deleted customer lifecycle state." });
  }

  // Initialize inside the execution context
  const supabaseAdmin = await createAdminClient();


  try {
    switch (event.type) {
      // 1. Sync Catalog Artifacts
      case 'product.created':
      case 'product.updated':
        await handleProductSync(event.data.object as Stripe.Product, supabaseAdmin);
        break;

      case 'price.created':
      case 'price.updated':
        await handlePriceSync(event.data.object as Stripe.Price, supabaseAdmin);
        break;

      // 2. Provision / Upgrade Core Subscriptions
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const response = await handleSubscriptionProvisioning(event, supabaseAdmin);
        if (response) return response; // Respects early returns from the internal shield
        break;

      // 3. De-provisioning / Teardown
      case 'customer.subscription.deleted':
        const cancellation = await handleSubscriptionDeletion(event.data.object as Stripe.Subscription, supabaseAdmin);
        if (cancellation) return cancellation;
        break;

      // 4. Various other subscription state changes
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await handleSubscriptionStatus(event, supabaseAdmin);
        break;
      }
    }
   catch (handlerError: any) {
    console.error(`Webhook execution failed internally for ${event.type}:`, handlerError.message);
    // Return a 500 status code so Stripe knows to safely retry transmitting the payload later
    return new NextResponse(`Internal Handler Error`, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/******************************************************
 * Handles Complex Provisioning, Idempotency Safeguards, and Rollback Routing
 *****************************************************/
async function handleSubscriptionProvisioning(event: Stripe.Event, supabaseAdmin: SupabaseClient) {
  
  let customerId: string;
  let subscriptionId: string;
  let planChoice: string | undefined;
  let sessionMetadata: Stripe.Metadata | undefined;
  let subscriptionObject: Stripe.Subscription;

  console.log(`[Webhook Event Received] Type: ${event.type}`);

  // 1. Extract structural data depending cleanly on the event type context
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    customerId = session.customer as string;
    subscriptionId = session.subscription as string;
    planChoice = session.metadata?.planChoice || session.metadata?.plan; 
    sessionMetadata = session.metadata || undefined;
    
    // Checkout sessions don't wrap full subscription schemas inline; request details
    subscriptionObject = await stripe.subscriptions.retrieve(subscriptionId);
  } else {
    // No network roundtrip required! Cast directly from memory payload
    subscriptionObject = event.data.object as Stripe.Subscription;
    customerId = subscriptionObject.customer as string;
    subscriptionId = subscriptionObject.id;
    sessionMetadata = subscriptionObject.metadata || undefined; 
  }


  // THE SOURCE OF TRUTH: Extract the actual active price item and seat count
  const subscriptionItem = subscriptionObject.items.data[0];
  const actualPriceId = subscriptionItem.price.id;
  //const currentSeatCount = subscriptionItem.quantity || 1;
  
  // Resolve plan by its actual Price ID first (handles Portal changes flawlessly), fall back to metadata
  const calculatedPlanName = getPlanFromPriceId(actualPriceId);
  const targetTier = calculatedPlanName !== 'free' ? calculatedPlanName : (sessionMetadata?.planChoice || subscriptionObject.metadata?.planChoice || 'free');

  const status = subscriptionObject.status; // e.g., 'active', 'past_due', 'trialing'

  // =========================================================
  // IDENTITY RESOLUTION PIPELINE
  // =========================================================
  let userId: string | null = null;
  let accountId: string | null = null; //internal not stripe

  // PATH A: The Primary Gold Standard Lookup (Query by Stripe Customer ID)
  console.log(`[Webhook] Attempting account lookup via Stripe Customer ID: ${customerId}`);
  const matchedAccount = await getAccountByStripeId(customerId);
  
  if (matchedAccount) {
    userId = matchedAccount.user_id;
    accountId = matchedAccount.id;
    console.log(`[Webhook] Identity found via DB mapping. Account: ${accountId}, User: ${userId}`);
  }

  // PATH B: First Fallback (Extract from subscription or session metadata structures)
  if (!userId) {
    // Look across session metadata first, then fall back to core subscription metadata object
    userId = sessionMetadata?.userId || subscriptionObject.metadata?.userId || null;
    if (userId) console.log(`[Webhook Recovery] Identity extracted from Stripe object metadata: ${userId}`);
  }

  // PATH C: Second Fallback (Lazy-fetch Customer object from Stripe ONLY if lookup failed)
  if (!userId) {
    console.log(`[Webhook Warning] Identity missing. Fetching customer profile from Stripe...`);
    const customerObj = await stripe.customers.retrieve(customerId);
    
    if (!customerObj.deleted && customerObj.email) {
      const { data: userLookup } = await supabaseAdmin
        .from('users') 
        .select('id')
        .eq('email', customerObj.email)
        .single();

      if (userLookup) {
        userId = userLookup.id;
        console.log(`[Webhook Recovery] Successfully recovered userId (${userId}) via customer email fallback.`);
      }
    }
  }

  // =========================================================
  // IDENTITY RESOLUTION PIPELINE - THE KILL PATH
  // =========================================================
  if (!userId) {
    // 1. Check for basic idempotency first (if already processed, ignore safely)
    const { data: existingSub } = await supabaseAdmin
      .from('accounts') 
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .single();

    if (existingSub) {
      console.log(`[Idempotency Shield] Safely ignored unmappable userId for already processed subscription: ${subscriptionId}`);
      return NextResponse.json({ received: true });
    }

    // 2. Evaluate if this subscription transaction profile carries history
    let isBrandNewSignup = true;
    if (subscriptionObject.latest_invoice) {
      try {
        const invoice = await stripe.invoices.retrieve(subscriptionObject.latest_invoice as string);
        if (invoice.billing_reason !== 'subscription_create') {
          isBrandNewSignup = false;
        }
      } catch (invoiceErr) {
        console.error("[Webhook Recovery] Could not check invoice history, assuming defensive posture.");
      }
    }

    // CASE A: Defend against unresolvable brand-new subscription checkouts
    if (isBrandNewSignup) {
      console.error(`[FATAL NEW SIGNUP ERROR] Unidentifiable transaction context on creation! Customer: ${customerId}, Sub: ${subscriptionId}. Executing immediate rollback.`);
      
      await executeAutoRecoveryRollback(subscriptionObject, customerId, subscriptionId);
      await sendEmergencyAdminAlert({
        customerId,
        subscriptionId,
        error: "CRITICAL: Brand new checkout finalized, but internal database userId was lost or unresolvable. Subscription forced into rollback loop."
      });
      
      return NextResponse.json({ error: "Fulfillment failed, transaction rolled back safely." }, { status: 422 });
    } 
    
    // CASE B: Gracefully route existing customer update mismatch triggers out-of-band
    else {
      console.error(`[AMBIGUOUS ACCOUNT UPDATE WARNING] Received subscription lifecycle event for Stripe Customer ${customerId} / Sub ${subscriptionId}, but database mapping failed.`);
      
      await sendEmergencyAdminAlert({
        customerId,
        subscriptionId,
        error: "NON-FATAL SYNC FAILURE: An existing, active paid subscription fired a lifecycle event, but the user mapping was temporarily unresolvable in Supabase. Handled out-of-band to prevent customer disruption."
      });

      return NextResponse.json({ received: true, note: "Handled out-of-band to safeguard customer uptime." });
    }
  } //////////////KILL PATH ENDS///////////////////////////////////////////////////////////////////////////////////////

  // =========================================================
  // DATABASE PROVISIONING SEQUENCING
  // =========================================================

  // Resolve the accountId via membership table ONLY if Path A missed it
  if (!accountId) {
    console.log(`[Webhook Debug] Checking membership role for Workspace context...`);
    const { data: membership, error: memberError } = await supabaseAdmin
      .from('memberships')
      .select('account_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .single();

    if (memberError) console.error("[Webhook Debug] Membership lookup error:", memberError);
    accountId = membership?.account_id || null;
  }

  // Execute workspace package upgrade changes
  if (accountId) {
    console.log(`[Webhook Debug] Found target account ${accountId}. Provisioning package update...`);

    // Sync updates to the active row matching this unique workspace account
    const { error: accountError } = await supabaseAdmin
      .from('accounts')
      .update({ 
        plan_name: targetTier, 
        paid_plan: targetTier,
        subscription_status: status, // Syncs exact current status from Stripe (active, past_due, etc.)
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
       // seat_count: currentSeatCount // Dynamic variable tracking team seat changes
      })
      .eq('id', accountId); // Targets the workspace ID precisely
    
    if (accountError) {
      console.error("[Webhook Debug] Account tier change failure:", accountError);
    } else {
      console.log(`[Webhook Success] Upgraded account ${accountId} to tier: ${targetTier}`);
    }
  } else {
    console.error(`CRITICAL: System could not locate an owned account record associated with user ID: ${userId}`);
  }

  return NextResponse.json({ received: true });
}

/********************************************************
 * Clears database permissions if a subscription is deleted/terminated upstream
 *******************************************************/
async function handleSubscriptionDeletion(subscription: Stripe.Subscription, supabaseAdmin: SupabaseClient) {

  let customerId = subscription.customer as string;
  let subscriptionId = subscription.id;
  let planChoice = subscription.metadata?.planChoice || subscription.metadata?.plan;
  let sessionMetadata = subscription.metadata || undefined; 

  let userId: string | null = null;
  let accountId: string | null = null;

  
  const matchedAccount = await getAccountByStripeId(customerId);
  
  // IT WORKED. WE HAVE ACCOUNT AND SUB //////////////////
  if (matchedAccount) {
    userId = matchedAccount.user_id;
    accountId = matchedAccount.id;
    console.log(`[Webhook] Identity found via DB mapping. Account: ${accountId}, User: ${userId}`);
  }

  if(!accountId){
  console.log(`[Webhook Warning] Missing accountId in subscription deletion event. Attempting recovery via Stripe Customer ID: ${customerId}`);
  return NextResponse.json({ received: false });  
  }


  await supabaseAdmin
    .from('accounts')
    .update({ 
        plan_name: 'free', 
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
      })
      .eq('id', accountId);
  
  console.log(`Successfully updated subscription status to canceled for: ${subscription.id}`);

  return NextResponse.json({ received: true });

}



async function handleSubscriptionStatus(event: Stripe.Event, supabaseAdmin: SupabaseClient) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;
  
  const matchedAccount = await getAccountByStripeId(customerId);
  if (!matchedAccount) return;

  switch (event.type) {
    case 'customer.subscription.paused':
      await supabaseAdmin
        .from('accounts')
        .update({ 
          plan_name: 'free',                 // Demote access to free tier constraints
          subscription_status: 'paused'
          // paid_plan safely remains 'pro', 'business', etc.
        })
        .eq('id', matchedAccount.id);
      break;

    case 'customer.subscription.resumed': {
      // Self-Healing Strategy: Fall back to Stripe metadata ONLY if your DB column is empty
      const targetPlan = matchedAccount.paid_plan || subscription.metadata?.planChoice || 'pro';
      
      await supabaseAdmin
        .from('accounts')
        .update({ 
          plan_name: targetPlan,             // Restore active access to their paid tier
          subscription_status: 'active'
        })
        .eq('id', matchedAccount.id);
      break;
    }

    case 'invoice.payment_failed':
      await supabaseAdmin
        .from('accounts')
        .update({ 
          plan_name: 'free',                 // Lock them down due to failed billing
          subscription_status: 'past_due' 
        })
        .eq('id', matchedAccount.id);
      break;

    case 'invoice.payment_succeeded': {
      const targetPlan = matchedAccount.paid_plan || subscription.metadata?.planChoice || 'pro';
      
      await supabaseAdmin
        .from('accounts')
        .update({ 
          plan_name: targetPlan,             // Recovery success, reopen access lines
          subscription_status: 'active' 
        })
        .eq('id', matchedAccount.id);
      break;
    }
  }
}



/******************************************************
 * Syncs Stripe Products with Supabase Catalog Tables
 ********************************************************/
async function handleProductSync(product: Stripe.Product, supabaseAdmin: SupabaseClient) {
  await supabaseAdmin.from('products').upsert({
    id: product.id,
    active: product.active,
    name: product.name,
    description: product.description,
    image: product.images?.[0],
    metadata: product.metadata,
  }, { onConflict: 'id' });
}

/******************************************************
 * Syncs Stripe Prices with Supabase Catalog Tables
 *****************************************************/
async function handlePriceSync(price: Stripe.Price, supabaseAdmin: SupabaseClient) {
  await supabaseAdmin.from('prices').upsert({
    id: price.id,
    product_id: price.product as string,
    active: price.active,
    currency: price.currency,
    type: price.type,
    unit_amount: price.unit_amount,
    interval: price.recurring?.interval,
    interval_count: price.recurring?.interval_count,
  }, { onConflict: 'id' });
}



/**
 * Isolated logic layer for managing refunds and cancellations
 */
async function executeAutoRecoveryRollback(sub: Stripe.Subscription, customerId: string, subscriptionId: string) {
  try {
    if (sub.latest_invoice) {
      const invoice = await stripe.invoices.retrieve(sub.latest_invoice as string);
      const paymentIntentId = (invoice as any)['payment_intent'] as string | undefined;
      
      if (paymentIntentId) {
        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
          reason: 'requested_by_customer', 
          metadata: {
            reason: 'Automated SaaS rollback: Missing internal userId mapping correlation during fulfillment.',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId
          }
        });
        console.warn(`[Auto-Recovery] Successfully issued immediate refund (${refund.id})`);
      } else {
        console.error(`[Auto-Recovery Warning] Could not extract payment_intent from invoice ${invoice.id}.`);
      }
    }
    
    await stripe.subscriptions.cancel(subscriptionId);
    console.warn(`[Auto-Recovery] Canceled rogue subscription ${subscriptionId}`);
  } catch (recoveryError: any) {
    console.error("CRITICAL: Automated rollback refund/cancellation sequence failed!", recoveryError.message);
  }
}

interface AlertPayload {
  customerId: string;
  subscriptionId: string;
  error: string;
}

async function sendEmergencyAdminAlert({ customerId, subscriptionId, error }: AlertPayload) {
  const timestamp = new Date().toISOString();
  const alertMessage = `
    EMERGENCY SAAS BILLING ALERT
    Timestamp: ${timestamp}
    Issue: ${error}
    Stripe Customer ID: ${customerId}
    Stripe Subscription ID: ${subscriptionId}
  `;
  console.error(alertMessage);
}

/**
 * Defensive guard to parse and inspect if an incoming customer reference 
 * has been marked as deleted upstream by Stripe.
 */
function isCustomerDeleted(event: Stripe.Event): boolean {
  let customerParam: string | Stripe.Customer | Stripe.DeletedCustomer | null = null;

  // Extract the raw customer field depending on the structural envelope type
  if (event.type === 'checkout.session.completed') {
    customerParam = (event.data.object as Stripe.Checkout.Session).customer;
  } else if (event.type.startsWith('customer.subscription.') || event.type.startsWith('invoice.')) {
    // This safely blankets subscriptions and invoice sub-properties
    customerParam = (event.data.object as any).customer;
  }

  // If Stripe passed a full object and it contains the truthy deleted flag, catch it
  if (
    customerParam && 
    typeof customerParam === 'object' && 
    'deleted' in customerParam && 
    customerParam.deleted
  ) {
    return true;
  }

  return false;
}
