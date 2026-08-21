import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAccountByStripeId } from '@/lib/supabase/queries'
import {createAdminClient} from '@/lib/supabase/admin'
import { SupabaseClient } from '@supabase/supabase-js'
import { Database, Tables } from '@/lib/tl_utils/database_types'
import { sendEmergencyAdminAlert } from '@/lib/utils/sendEmergencyLog'
import { PRICE_IDS } from '@/lib/utils/constants'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-07-29.dahlia",
});

// TIER MAP
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
 
  const body = await req.text();
  const signature = (await headers()).get('Stripe-Signature') as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
    console.log("EVENT OF THIS TYPE RECEIEVED TO POST: ", event.type)

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
  const supabaseAdmin: SupabaseClient<Database> = await createAdminClient();


  try { 
    switch (event.type) {
      // 2. Provision / Upgrade Core Subscriptions
      case 'customer.subscription.created':
        const response = await handleSubscriptionProvisioning(event, supabaseAdmin);
        if (response) return response; // Respects early returns from the internal shield
        break;

      // Handle final payment or active changes
      // this will flip the sub_status column to be
      // inactive / active / inactive / active
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
      case 'customer.subscription.updated':
        await handleSubscriptionStatus(event, supabaseAdmin);
        break;

      // De-provisioning / Teardown
      case 'customer.subscription.deleted':
        const cancellation = await handleSubscriptionDeletion(event.data.object as Stripe.Subscription, supabaseAdmin);
        if (cancellation) return cancellation;
        break;
      }
    } catch (handlerError: any) {
    console.error(`Webhook execution failed internally for ${event.type}:`, handlerError.message);
    // Return a 500 status code so Stripe knows to safely retry transmitting the payload later
    return new NextResponse(`Internal Handler Error`, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/******************************************************
 * Handles Complex Provisioning, Idempotency Safeguards, and Rollback Routing
 *****************************************************/
async function handleSubscriptionProvisioning(event: Stripe.Event, supabaseAdmin: SupabaseClient<Database>) {
  
  if(event.type !== 'customer.subscription.created'){
    console.log("wrong event type:", event.type);
    return null;
  }
  
  console.log("handleSubscriptionProvisioning", event.type)
 
  // Explicitly cast to Stripe.Subscription to unlock autocompletion and safety
  const subscriptionObject = event.data.object as Stripe.Subscription;

  // 2. Extract high-level identifiers safely
  const subscriptionId = subscriptionObject.id;                 
  const customerId = subscriptionObject.customer as string;
  const sessionMetadata = subscriptionObject.metadata;
  const status = 'pending' // subscriptionObject.status => updated to 'active' when payment received

  // 3. Extract item-level data safely using the first array element
  const subscriptionItem = subscriptionObject.items?.data?.[0];
  
  if (!subscriptionItem) {
    console.error(`[Provisioning Error] Subscription ${subscriptionId} has no line items.`);
    return null; 
  }

  const subscriptionItemId = subscriptionItem.id || '';
  const plan_name = sessionMetadata?.plan_name || subscriptionItem.plan?.nickname;
  console.log("PLAN NAME:", plan_name)
  const actualPriceId = subscriptionItem.price?.id;
  const currentSeatCount = subscriptionItem.quantity || 1;

  // 4. Debug check to verify your payload parsing works perfectly
  console.log(`[Provisioning Preview] Sub: ${subscriptionId} | Price: ${actualPriceId} | Seats: ${currentSeatCount} | itemID: ${subscriptionItemId} `);

 // =========================================================
// IDENTITY RESOLUTION PIPELINE
// =========================================================
let userId: string | null = null;
let accountId: string | null = null;

// PATH A: The Gold Standard (Fast DB Lookup)
const matchedAccount = await getAccountByStripeId(customerId);
if (matchedAccount) {
  userId = matchedAccount.user_id;
  accountId = matchedAccount.id;
}

// PATH B: The Metadata Safety Net
if (!userId) {
  userId = sessionMetadata?.userId || subscriptionObject.metadata?.userId || null;
}
if (!accountId) {
  accountId = sessionMetadata?.accountId || subscriptionObject.metadata?.accountId || null;
}

/// Getting desperate now, let's look in the memberships table 
if (!accountId && userId) {
   // console.log(`[Webhook Debug] Checking membership role for Workspace context...`);
    const { data: membership, error: memberError } = await supabaseAdmin
      .from('memberships')
      .select('account_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .single();

    if (memberError) console.error("[Webhook Debug] Membership lookup error:", memberError);
    accountId = membership?.account_id || null;
  }

// =========================================================
// THE KILL PATH (Leveraging Stripe's Native Retries)
// =========================================================
if (!userId || !accountId) {
  console.log("we have an issue with user/acc ID:", userId, accountId)
  // Check if we already processed this subscription to prevent duplicate work
  const { data: existingSub } = await supabaseAdmin
    .from('accounts') 
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (existingSub) {
    return NextResponse.json({ received: true, note: "Idempotency catch" });
  }

  // 2. PERMANENT BUG PROTECTION: Log this to a dedicated error table
  // Passing userId, accountId, and plan_name even if they are null/undefined
  await supabaseAdmin
    .from('billing_errors') 
    .insert({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      error_reason: `Missing identity mapping. User: ${userId}, Account: ${accountId}`,
      resolved: false,
      user_id: userId || null,       // Tracks partial resolution data
      account_id: accountId || null, // Tracks partial resolution data
      plan_name: plan_name || null   // Tracks which tier they tried to buy
    });

  // 3. Trigger your internal alerting system
  await sendEmergencyAdminAlert({
    title: "ORPHANED PAYING CUSTOMER DETECTED",
    message: `Customer paid for ${plan_name || 'unknown plan'} but we couldn't resolve their internal accountId. Action required!`,
    customerId: customerId,       // Passes the local webhook variable
    subscriptionId: subscriptionId, // Passes the local webhook variable
    // error: "Optional raw error message context if you want it"
  });

  return NextResponse.json(
    { error: "Identity resolution pending. Event will be retried by Stripe." }, 
    { status: 422 } // 422 or 500 forces Stripe to automatically retry later
  );
}


// Execute workspace package upgrade changes
// =========================================================
// DATABASE PROVISIONING
// =========================================================
console.log(`[Provisioning] Linking Subscription ${subscriptionId} to Account ${accountId}`);

  const { error: dbError } = await supabaseAdmin
    .from('accounts')
    .update({
      stripe_customer_id: customerId,       
      stripe_subscription_id: subscriptionId,
      stripe_subscription_item_id: subscriptionItemId,
      plan_name: plan_name || 'pro', // Fallback value just in case nickname isn't set
      paid_plan: plan_name || 'pro',
      subscription_status: status,   // e.g., 'active'
      seat_count: currentSeatCount,
    })
    .eq('id', accountId); // Explicitly targets the existing account row

  if (dbError) {
    console.error(`[Database Error] Provisioning failed for account ${accountId}:`, dbError);
    // Throwing an error forces a 500/422 response, triggering Stripe's retry mechanism
    throw new Error(`Database sync failed: ${dbError.message}`);
  }

  // =========================================================
  //  AUTO-RESOLVE PREVIOUS ALERTS (Self-Healing Loop)
  // =========================================================
  // If this run succeeded, look for any open errors for this subscription and mark them resolved.
  const { error: resolveError } = await supabaseAdmin
    .from('billing_errors')
    .update({ resolved: true })
    .eq('stripe_subscription_id', subscriptionId)
    .eq('resolved', false); // Only target open issues

  if (resolveError) {
    // We log this as a warning, but don't crash the handler because 
    // the user's primary database account upgrade succeeded perfectly.
    console.warn(`[Warning] Could not auto-resolve billing error log:`, resolveError.message);
  } else {
    console.log(`[Self-Healing] Cleaned up out-of-band resolution logs for Sub: ${subscriptionId}`);
  }

  console.log(`[Provisioning Success] Account ${accountId} upgraded to ${plan_name || 'Paid Tier'} successfully.`);
  return NextResponse.json({ received: true, provisioned: true });

}


/********************************************************
 * Clears database permissions if a subscription is deleted/terminated upstream
 * sent by: 'customer.subscription.deleted'
 *******************************************************/
async function handleSubscriptionDeletion(subscription: Stripe.Subscription, supabaseAdmin: SupabaseClient<Database>) {

  let customerId = subscription.customer as string;
  let subscriptionId = subscription.id;
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
        plan_name: 'free'
      })
      .eq('id', accountId )
      .eq('stripe_subscription_id', subscriptionId);
  
  console.log(`Successfully updated subscription status to canceled for: ${subscription.id}`);

  return NextResponse.json({ received: true });

}



async function handleSubscriptionStatus(event: Stripe.Event, supabaseAdmin: SupabaseClient<Database>) {

  let customerId: string | null = null;
  let eventObject = null;


  // Typecast incoming event object //////////////////////////////////////
  if (event.type.startsWith('customer.subscription.')) {
    eventObject = event.data.object as Stripe.Subscription;
    customerId = typeof eventObject.customer === 'string' 
      ? eventObject.customer 
      : eventObject.customer?.id || null;

  } else if (event.type.startsWith('invoice.')) {
    eventObject = event.data.object as Stripe.Invoice;
    customerId = typeof eventObject.customer === 'string' 
      ? eventObject.customer 
      : eventObject.customer?.id || null;
  }




  // Global Guardrails ///////////////////////////////////////////////////////////////////////////
   if (!eventObject) {
    console.error(`[Webhook] eventObject was not initialized: ${event.type}`);
    return;
  }

  if (!customerId) {
    console.error(`[Webhook] Unhandled event category or missing customer for: ${event.type}`);
    return;
  }
  const matchedAccount = await getAccountByStripeId(customerId);
  if (!matchedAccount) {
    console.error(`[Webhook] No DB account matches Stripe Customer: ${customerId}`);
    return;
  }

  // SWITCH on INVOICE or SUBSCRIPTION events ////////////////////////////////////////////////////////
  // SUBS update the db directly with upgrade/downgrade
  // INVOICEs update status -> active/inactive/paused/resumed
  switch (event.type) {
    case 'customer.subscription.paused':{
      await supabaseAdmin
        .from('accounts')
        .update({ 
          plan_name: 'free',                 // Demote access to free tier constraints
          subscription_status: 'paused'
          // paid_plan safely remains 'pro', 'business', etc.
        })
        .eq('id', matchedAccount.id);
      break;
    }
    case 'customer.subscription.resumed': {
      // Self-Healing Strategy: Fall back to Stripe metadata ONLY if your DB column is empty
      const targetPlan = matchedAccount.paid_plan || eventObject.metadata?.planChoice || 'pro';
      
      await supabaseAdmin
        .from('accounts')
        .update({ 
          plan_name: targetPlan,             // Restore active access to their paid tier
          subscription_status: 'active'
        })
        .eq('id', matchedAccount.id);
      break;
    }
    case 'invoice.payment_failed':{
      await supabaseAdmin
        .from('accounts')
        .update({ 
          plan_name: 'free',                 // Lock them down due to failed billing
          subscription_status: 'past_due' 
        })
        .eq('id', matchedAccount.id);
      break;
    }
    case 'invoice.payment_succeeded': {
  const invoice = event.data.object;
  
  // 1. Extract the active array of line items itemized on this invoice
  const lineItems = invoice.lines?.data;
  if (!lineItems || lineItems.length === 0) {
    console.error('[Invoice Webhook Error] Invoice contains zero line items.');
    return new Response('Missing itemized lines', { status: 400 });
  }

  console.log("LINE ITEMS INV:  ", lineItems)

  // 2. Cast to any to bypass TS compilation strictness safely 🛡️
  const firstItem = lineItems[0] as any;
  
  // 3. Fall back to item.plan?.id if your Stripe Dashboard uses an older API version pin
  const targetPriceId = firstItem.price?.id || firstItem.plan?.id;


  // 3. Run the dynamic reverse lookup against your PRICE_IDS map
  const verifiedPaidPlan = Object.keys(PRICE_IDS).find(key => PRICE_IDS[key] === targetPriceId);

  // Safety fall-through guardrail
  if (!verifiedPaidPlan) {
    console.error(`[Invoice Webhook Error] Unmapped Price ID detected: ${targetPriceId}`);
    return new Response('Price ID lookup failed', { status: 400 });
  }

  console.log(`[Invoice Webhook] Success! Money received for tier: ${verifiedPaidPlan}`);

  // 4. Sync up your separate data states
  const { error: dbError, data: updatedRows } = await supabaseAdmin
    .from('accounts')
    .update({
      plan_name: verifiedPaidPlan,  // 🔑 Open the active gate because payment cleared!
      paid_plan: verifiedPaidPlan,  // 📝 Update the "most recently paid" ledger tracking record
    })
    .eq('id', matchedAccount.id)    // Uses your matched account from context scope
    .select('id, plan_name, paid_plan');

  if (dbError) {
    console.error(`[Database Error] Failed to open access gate for account ${matchedAccount.id}:`, dbError);
    return new Response('Database gate open error', { status: 500 });
  }

  console.log(`[Postgres Verification] Row immediately after invoice payment UPDATE query:`, updatedRows?.[0]);

  break;
}
  case 'customer.subscription.updated': {
    console.log("current plan is ", matchedAccount.paid_plan);
    //console.log("customer.subscription.updated looks like this:", event);

    const subscription = event.data.object;
    const previousAttributes = event.data.previous_attributes;
    
    // 1. Check if the underlying line items actually changed
    const isPlanChange = previousAttributes && 'items' in previousAttributes;     
    
    if (isPlanChange) {
      console.log('[Webhook] Confirmed: This is a genuine tier upgrade or downgrade.');
      
      // Extract your new plan details
      const activeItem = subscription.items.data[0];
      const incomingPriceId = activeItem.price.id; 
      
      // 2. Perform the dynamic reverse lookup
      const newPlanName = Object.keys(PRICE_IDS).find(key => PRICE_IDS[key] === incomingPriceId);

      // 3. Guardrail if someone manages to buy an unmapped legacy plan
      if (!newPlanName) {
        console.error(`[Webhook Error] Unrecognized Price ID received: ${incomingPriceId}`);
        return new Response('Unknown price conversion', { status: 400 });
      }

      console.log(`[Database] Synchronizing account ${matchedAccount.id} to tier: ${newPlanName}`);

      // 4. Update your database schema
      const {data: updatedRows, error: dbError } = await supabaseAdmin
        .from('accounts')
        .update({
          plan_name: newPlanName,
          paid_plan: newPlanName,
          stripe_subscription_item_id: activeItem.id, // Keep tracking the fresh active item ID
        })
        .eq('id', matchedAccount.id)
        .select('id, plan_name, paid_plan');
      if (dbError) {
        console.error(`[Database Error] Tier transition failed for account ${matchedAccount.id}:`, dbError);
        return new Response('Database write error during upgrade', { status: 500 });
      }

      console.log(`[Postgres Verification] Row immediately after UPDATE query:`, updatedRows?.[0])
    } else {
      console.log('[Webhook] Noise Filtered: Status/Metadata update, skipping tier provisioning.');
    }

    break; 
    }
  }
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
