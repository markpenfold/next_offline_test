import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia"
})

export async function getUserBillingPeriod(customerId:string) {
  try {
    // Fetch the active subscriptions for the customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active', // Look for active subscriptions
      limit: 1,         // Grab the primary active subscription
    });

    if (subscriptions.data.length === 0) {
      return { message: "No active subscription found for this user." };
    }

    const activeSubscription = subscriptions.data[0];
    const subscriptionItem = activeSubscription.items.data[0];
    const startTimestamp = subscriptionItem.current_period_start;
    const endTimestamp = subscriptionItem.current_period_end;

    return {
        status: activeSubscription.status,
        billingPeriodStart: new Date(startTimestamp * 1000).toLocaleDateString(),
        billingPeriodEnd: new Date(endTimestamp * 1000).toLocaleDateString(),
    };


if (!subscriptionItem) {
  throw new Error("Subscription does not contain any items.");
}
  } catch (error) {
    console.error("Stripe error:", error);
    throw error;
  }
}