import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';
import { getAccountByStripeId } from '@/lib/supabase/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import { Database } from '@/lib/tl_utils/database_types';
import { sendEmergencyAdminAlert } from '@/lib/utils/sendEmergencyLog';
import { PRICE_IDS } from '@/lib/utils/constants';
import { STRIPE_API_VERSION } from '@/lib/utils/stripeConfig';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: STRIPE_API_VERSION,
});

type AdminClient = SupabaseClient<Database>;

class WebhookError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

// =========================================================
// MAIN WEBHOOK ENTRYPOINT
// =========================================================
export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get('Stripe-Signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe-Signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Signature Error: ${err.message}` }, { status: 400 });
  }

  if (isCustomerDeleted(event)) {
    console.warn(`[Webhook] Ignored ${event.type}: target customer was deleted.`);
    return NextResponse.json({ received: true, note: 'Ignored deleted customer' });
  }

  const supabaseAdmin = await createAdminClient();

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription, supabaseAdmin);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          event.data.previous_attributes,
          supabaseAdmin
        );
        break;

      case 'customer.subscription.paused':
        await handleSubscriptionPaused(event.data.object as Stripe.Subscription, supabaseAdmin);
        break;

      case 'customer.subscription.resumed':
        await handleSubscriptionResumed(event.data.object as Stripe.Subscription, supabaseAdmin);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabaseAdmin);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoiceSucceeded(event.data.object as Stripe.Invoice, supabaseAdmin);
        break;

      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object as Stripe.Invoice, supabaseAdmin);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    if (err instanceof WebhookError) {
      console.error(`[Webhook ${err.status}] ${event.type}: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error(`[Webhook 500] Unexpected error for ${event.type}:`, err);
    return NextResponse.json({ error: 'Internal Handler Error' }, { status: 500 });
  }
}

// =========================================================
// EVENT HANDLERS
// =========================================================

async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
  supabaseAdmin: AdminClient
) {
  const customerId = extractCustomerId(subscription.customer);
  const item = subscription.items?.data?.[0];

  if (!item) {
    throw new WebhookError(`Subscription ${subscription.id} has no line items.`, 400);
  }

  const priceId = item.price?.id;
  const planName = resolvePlanFromPriceId(priceId);
  const seatCount = item.quantity ?? 1;

  // 1. Resolve Account Identity
  const identity = await resolveIdentity(customerId, subscription.metadata, supabaseAdmin);

  if (!identity.accountId) {
    await handleOrphanedSubscription({
      customerId,
      subscriptionId: subscription.id,
      userId: identity.userId,
      planName,
      supabaseAdmin,
    });
    // Triggers Stripe retry (422) after logging and alerting
    throw new WebhookError('Identity resolution pending; queued for Stripe retry.', 422);
  }

  // 2. Provision Account
  const { error: dbError } = await supabaseAdmin
    .from('accounts')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_subscription_item_id: item.id,
      plan_name: planName,
      paid_plan: planName,
      subscription_status: subscription.status === 'active' ? 'active' : 'pending',
      seat_count: seatCount,
    })
    .eq('id', identity.accountId);

  if (dbError) {
    throw new WebhookError(`DB provisioning failed for ${identity.accountId}: ${dbError.message}`, 500);
  }

  // 3. Self-Healing: Auto-resolve any prior billing_errors for this subscription
  const { error: resolveError } = await supabaseAdmin
    .from('billing_errors')
    .update({ resolved: true })
    .eq('stripe_subscription_id', subscription.id)
    .eq('resolved', false);

  if (resolveError) {
    console.warn(`[Self-Healing] Failed to close billing_error log: ${resolveError.message}`);
  }

  console.log(`[Provisioned] Account ${identity.accountId} -> ${planName} (${seatCount} seats)`);
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  previousAttributes: Partial<Stripe.Subscription> | undefined,
  supabaseAdmin: AdminClient
) {
  const customerId = extractCustomerId(subscription.customer);
  const account = await requireAccountByStripeId(customerId, supabaseAdmin);

  const hasItemChange = Boolean(previousAttributes && 'items' in previousAttributes);
  const hasStatusChange = Boolean(previousAttributes && 'status' in previousAttributes);

  if (!hasItemChange && !hasStatusChange) {
    console.log(`[Webhook] Noise filtered for subscription ${subscription.id}`);
    return;
  }

  const updates: Database['public']['Tables']['accounts']['Update'] = {};

  if (hasItemChange) {
    const activeItem = subscription.items.data[0];
    if (!activeItem) {
      throw new WebhookError(`Updated subscription ${subscription.id} missing line items.`, 400);
    }

    const newPlanName = resolvePlanFromPriceId(activeItem.price.id);
    updates.plan_name = newPlanName;
    updates.paid_plan = newPlanName;
    updates.stripe_subscription_item_id = activeItem.id;
    updates.seat_count = activeItem.quantity ?? 1;
  }

  if (hasStatusChange) {
    updates.subscription_status = subscription.status;
    // Lock down access if subscription enters a non-entitled state
    if (['canceled', 'unpaid', 'paused'].includes(subscription.status)) {
      updates.plan_name = 'free';
    }
  }

  const { error } = await supabaseAdmin
    .from('accounts')
    .update(updates)
    .eq('id', account.id);

  if (error) {
    throw new WebhookError(`Failed updating subscription for account ${account.id}: ${error.message}`, 500);
  }

  console.log(`[Updated] Account ${account.id}:`, updates);
}

async function handleSubscriptionPaused(
  subscription: Stripe.Subscription,
  supabaseAdmin: AdminClient
) {
  const customerId = extractCustomerId(subscription.customer);
  const account = await requireAccountByStripeId(customerId, supabaseAdmin);

  const { error } = await supabaseAdmin
    .from('accounts')
    .update({
      plan_name: 'free',
      subscription_status: 'paused',
    })
    .eq('id', account.id);

  if (error) {
    throw new WebhookError(`Failed pausing account ${account.id}: ${error.message}`, 500);
  }
}

async function handleSubscriptionResumed(
  subscription: Stripe.Subscription,
  supabaseAdmin: AdminClient
) {
  const customerId = extractCustomerId(subscription.customer);
  const account = await requireAccountByStripeId(customerId, supabaseAdmin);

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const restoredPlan = account.paid_plan || (priceId ? resolvePlanFromPriceId(priceId) : 'pro');

  const { error } = await supabaseAdmin
    .from('accounts')
    .update({
      plan_name: restoredPlan,
      subscription_status: 'active',
    })
    .eq('id', account.id);

  if (error) {
    throw new WebhookError(`Failed resuming account ${account.id}: ${error.message}`, 500);
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabaseAdmin: AdminClient
) {
  const customerId = extractCustomerId(subscription.customer);
  const account = await requireAccountByStripeId(customerId, supabaseAdmin);

  const { error } = await supabaseAdmin
    .from('accounts')
    .update({
      plan_name: 'free',
      subscription_status: 'canceled',
    })
    .eq('id', account.id)
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    throw new WebhookError(`Failed canceling subscription for account ${account.id}: ${error.message}`, 500);
  }

  console.log(`[Canceled] Account ${account.id} reverted to free.`);
}

async function handleInvoiceSucceeded(invoice: Stripe.Invoice, supabaseAdmin: AdminClient) {
  const customerId = extractCustomerId(invoice.customer);
  const account = await requireAccountByStripeId(customerId, supabaseAdmin);

  const firstItem = invoice.lines?.data?.[0] as any;
  if (!firstItem) {
    throw new WebhookError(`Invoice ${invoice.id} contains zero line items.`, 400);
  }

  const priceId = firstItem.price?.id || firstItem.plan?.id;
  const verifiedPlan = resolvePlanFromPriceId(priceId);

  const { error } = await supabaseAdmin
    .from('accounts')
    .update({
      plan_name: verifiedPlan,
      paid_plan: verifiedPlan,
      subscription_status: 'active',
    })
    .eq('id', account.id);

  if (error) {
    throw new WebhookError(`Failed activating account ${account.id} on payment: ${error.message}`, 500);
  }

  console.log(`[Payment Succeeded] Account ${account.id} active on ${verifiedPlan}`);
}

async function handleInvoiceFailed(invoice: Stripe.Invoice, supabaseAdmin: AdminClient) {
  const customerId = extractCustomerId(invoice.customer);
  const account = await requireAccountByStripeId(customerId, supabaseAdmin);

  const { error } = await supabaseAdmin
    .from('accounts')
    .update({
      plan_name: 'free',
      subscription_status: 'past_due',
    })
    .eq('id', account.id);

  if (error) {
    throw new WebhookError(`Failed marking account ${account.id} past_due: ${error.message}`, 500);
  }

  console.log(`[Payment Failed] Account ${account.id} locked to free (past_due)`);
}

// =========================================================
// SHARED HELPERS
// =========================================================

function resolvePlanFromPriceId(priceId?: string | null): string {
  if (!priceId) {
    throw new WebhookError('Missing Stripe Price ID on subscription/invoice item.', 400);
  }

  const matchedPlan = Object.keys(PRICE_IDS).find((key) => PRICE_IDS[key] === priceId);
  if (!matchedPlan) {
    throw new WebhookError(`Unmapped Stripe Price ID: ${priceId}`, 400);
  }

  return matchedPlan;
}

function extractCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string {
  const id = typeof customer === 'string' ? customer : customer?.id;
  if (!id) {
    throw new WebhookError('Missing Stripe Customer ID on webhook payload.', 400);
  }
  return id;
}

async function requireAccountByStripeId(customerId: string, supabaseAdmin: AdminClient) {
  const account = await getAccountByStripeId(customerId);
  if (!account) {
    // 422 signals Stripe to retry in case customer.subscription.created is still processing
    throw new WebhookError(`No DB account found for Stripe Customer: ${customerId}`, 422);
  }
  return account;
}

async function resolveIdentity(
  customerId: string,
  metadata: Stripe.Metadata | null | undefined,
  supabaseAdmin: AdminClient
): Promise<{ userId: string | null; accountId: string | null }> {
  // Path A: Fast DB Lookup via Stripe Customer ID
  const matchedAccount = await getAccountByStripeId(customerId);
  if (matchedAccount) {
    return { userId: matchedAccount.user_id, accountId: matchedAccount.id };
  }

  // Path B: Metadata Safety Net
  const userId = metadata?.userId || null;
  let accountId = metadata?.account_id || metadata?.accountId || null;

  // Path C: Owner Membership Lookup
  if (!accountId && userId) {
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('account_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .maybeSingle();

    accountId = membership?.account_id || null;
  }

  return { userId, accountId };
}

async function handleOrphanedSubscription({
  customerId,
  subscriptionId,
  userId,
  planName,
  supabaseAdmin,
}: {
  customerId: string;
  subscriptionId: string;
  userId: string | null;
  planName: string;
  supabaseAdmin: AdminClient;
}) {
  // Prevent duplicate alerts if Stripe is already retrying this subscription
  const { data: existingError } = await supabaseAdmin
    .from('billing_errors')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (existingError) return;

  await supabaseAdmin.from('billing_errors').insert({
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    error_reason: `Missing identity mapping. User: ${userId}, Account: null`,
    resolved: false,
    user_id: userId,
    account_id: null,
    plan_name: planName,
  });

  await sendEmergencyAdminAlert({
    title: 'ORPHANED PAYING CUSTOMER DETECTED',
    message: `Customer paid for ${planName} but internal accountId could not be resolved.`,
    customerId,
    subscriptionId,
  });
}

function isCustomerDeleted(event: Stripe.Event): boolean {
  const obj = event.data.object as any;
  const customer = obj?.customer;
  return Boolean(customer && typeof customer === 'object' && 'deleted' in customer && customer.deleted);
}