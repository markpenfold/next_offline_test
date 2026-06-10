# Stripe sign up logs and event types

```bash
AppstorePRovider RUNS
CreateAppStore RUNS with initial Tier of: none
 GET / 200 in 398ms (next.js: 171ms, application-code: 228ms)
 HEAD /api/ping 200 in 63ms (next.js: 52ms, application-code: 10ms)
 GET /pricing 200 in 62ms (next.js: 28ms, application-code: 34ms)
 GET /signup?plan=pro 200 in 173ms (next.js: 115ms, application-code: 57ms)
rawData sent to signUp: {
  planChoice: 'pro',
  full_name: 'bnbnbnbn',
  username: 'bnbnbnbnb',
  account_name: 'bnbnbnbnbnbn',
  email: 'mark_penfold+16@mac.com',
  password: '123ABC1299'
}
setting up Stripe Customer ID for userAccount: 1209b16c-4f79-44be-90b0-378a67d5f43b
Successfully mapped Stripe Customer cus_Ug9mPCvcYjUQHx to account 1209b16c-4f79-44be-90b0-378a67d5f43b
EVENT OF THIS TYPE RECEIEVED TO POST:  customer.created
 POST /api/webhooks/stripe 200 in 120ms (next.js: 102ms, application-code: 18ms)
 GET /confirm 200 in 203ms (next.js: 36ms, application-code: 167ms)
 POST /signup?plan=pro 303 in 4.7s (next.js: 5ms, application-code: 4.6s)
  └─ ƒ signup(null, {}) in 4357ms src/actions/auth.ts
 GET /auth/callback?code=ea55aa40-c24b-4c6a-a762-2890a5ab7049&plan=pro 307 in 912ms (next.js: 67ms, application-code: 846ms)
 GET /api/checkout/stripe?plan=pro&userId=22eb0492-fb95-4995-9439-3515695833ce&email=mark_penfold%2B16%40mac.com 307 in 1482ms (next.js: 49ms, application-code: 1432ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  charge.succeeded
 POST /api/webhooks/stripe 200 in 11ms (next.js: 3ms, application-code: 8ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  invoice.finalized
 POST /api/webhooks/stripe 200 in 10ms (next.js: 2ms, application-code: 8ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  invoice.paid
 POST /api/webhooks/stripe 200 in 9ms (next.js: 2ms, application-code: 7ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  payment_method.attached
 POST /api/webhooks/stripe 200 in 9ms (next.js: 1939µs, application-code: 7ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  customer.updated
 POST /api/webhooks/stripe 200 in 15ms (next.js: 3ms, application-code: 13ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  customer.subscription.created
getAccountByStripeId
EVENT OF THIS TYPE RECEIEVED TO POST:  checkout.session.completed
EVENT OF THIS TYPE RECEIEVED TO POST:  payment_intent.created
 POST /api/webhooks/stripe 200 in 8ms (next.js: 1826µs, application-code: 6ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  invoice.created
 POST /api/webhooks/stripe 200 in 8ms (next.js: 1719µs, application-code: 6ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  payment_intent.succeeded
 POST /api/webhooks/stripe 200 in 8ms (next.js: 1634µs, application-code: 6ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  invoice.payment_succeeded
Webhook execution failed internally for invoice.payment_succeeded: Cannot read properties of undefined (reading 'data')
 POST /api/webhooks/stripe 500 in 8ms (next.js: 1944µs, application-code: 6ms)
looking for owner of this account: 1209b16c-4f79-44be-90b0-378a67d5f43b -----------------------------------------------------------------
user_id from getAccountOwnerId: 22eb0492-fb95-4995-9439-3515695833ce
 POST /api/webhooks/stripe 200 in 647ms (next.js: 2ms, application-code: 644ms)
getAccountByStripeId
looking for owner of this account: 1209b16c-4f79-44be-90b0-378a67d5f43b -----------------------------------------------------------------
user_id from getAccountOwnerId: 22eb0492-fb95-4995-9439-3515695833ce
 POST /api/webhooks/stripe 200 in 993ms (next.js: 4ms, application-code: 989ms)
AppstorePRovider RUNS
CreateAppStore RUNS with initial Tier of: none
 GET /dash?session_id=cs_test_a1Sgh56yOxawgG7Zf9R3t3LMfAfFHpZpasyMpWN8KBcowjmiv5w5Z5K1KA 200 in 122ms (next.js: 32ms, application-code: 89ms)
 HEAD /api/ping 200 in 7ms (next.js: 3ms, application-code: 4ms)
 HEAD /api/ping 200 in 8ms (next.js: 3ms, application-code: 4ms)
 HEAD /api/ping 200 in 13ms (next.js: 8ms, application-code: 5ms)
EVENT OF THIS TYPE RECEIEVED TO POST:  invoice_payment.paid
 POST /api/webhooks/stripe 200 in 11ms (next.js: 3ms, application-code: 8ms)

```