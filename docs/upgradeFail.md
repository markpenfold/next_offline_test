# Stripe Upgrade Fail


```bash
 GET /pricing 200 in 212ms (next.js: 170ms, application-code: 42ms)
AppstorePRovider RUNS
CreateAppStore RUNS with initial Tier of: none
 GET /pricing 200 in 171ms (next.js: 3ms, application-code: 168ms)
AppstorePRovider RUNS
CreateAppStore RUNS with initial Tier of: none
 GET /confirm 200 in 87ms (next.js: 20ms, application-code: 67ms)
 HEAD /api/ping 200 in 76ms (next.js: 66ms, application-code: 10ms)
 HEAD /api/ping 200 in 6ms (next.js: 3ms, application-code: 4ms)
POST request received
FINAL SUB ID: sub_1TgnUU6gUEpoRo4qHWlZAOkF
FINAL ITEM ID: null
FINAL STATUS: active
[Billing Workflow] Active paid subscription found (sub_1TgnUU6gUEpoRo4qHWlZAOkF). Generating switch deep link...
Checkout routing failure: Error: You passed an empty string for 'flow_data[subscription_update_confirm][items][0][id]'. We assume empty values are an attempt to unset a parameter; however 'flow_data[subscription_update_confirm][items][0][id]' cannot be unset. You should remove 'flow_data[subscription_update_confirm][items][0][id]' from your request or supply a non-empty value.
    at POST (src/app/api/checkout/stripe/route.ts:176:65)
  174 |       console.log(`[Billing Workflow] Active paid subscription found (${finalSubscriptionId}). Generating switch deep link...`)
  175 |
> 176 |       const portalSession = await stripe.billingPortal.sessions.create({
      |                                                                 ^
  177 |         customer: accountCtx.stripeCustomerId!,
  178 |         flow_data: {
  179 |           type: 'subscription_update_confirm', {
  type: 'StripeInvalidRequestError',
  raw: {
    code: 'parameter_invalid_empty',
    doc_url: 'https://stripe.com/docs/error-codes/parameter-invalid-empty',
    message: "You passed an empty string for 'flow_data[subscription_update_confirm][items][0][id]'. We assume empty values are an attempt to unset a parameter; however 'flow_data[subscription_update_confirm][items][0][id]' cannot be unset. You should remove 'flow_data[subscription_update_confirm][items][0][id]' from your request or supply a non-empty value.",
    param: 'flow_data[subscription_update_confirm][items][0][id]',
    request_log_url: 'https://dashboard.stripe.com/acct_1SCHg06gUEpoRo4q/test/workbench/logs?object=req_T0nwevNar4pMpF',
    type: 'invalid_request_error',
    headers: {
      server: 'nginx',
      date: 'Wed, 10 Jun 2026 14:58:01 GMT',
      'content-type': 'application/json',
      'content-length': '731',
      connection: 'keep-alive',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, HEAD, PUT, PATCH, POST, DELETE',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'Request-Id, Stripe-Manage-Version, Stripe-Should-Retry, X-Stripe-External-Auth-Required, X-Stripe-Privileged-Session-Required',
      'access-control-max-age': '300',
      'cache-control': 'no-cache, no-store',
      'content-security-policy': "base-uri 'none'; default-src 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; script-src 'self' 'report-sample'; style-src 'self'; worker-src 'none'; upgrade-insecure-requests; report-uri https://q.stripe.com/csp-violation?q=oVpjeE1FONF8rgOoyLub8uDA_4viyPn4AV3kbw8lEJ0wZuxZQlj83_fCETUGdRfkvr204d_5siIm3KcO; report-to csp",
      'idempotency-key': 'stripe-node-retry-6975a61c-fa12-4c56-b3f8-12337e3b4076',
      'original-request': 'req_T0nwevNar4pMpF',
      'report-to': '{"group":"csp","max_age":8640,"endpoints":[{"url":"https://q.stripe.com/csp-report-v2?q=oVpjeE1FONF8rgOoyLub8uDA_4viyPn4AV3kbw8lEJ0wZuxZQlj83_fCETUGdRfkvr204d_5siIm3KcO&t=1"}],"include_subdomains":true}',
      'reporting-endpoints': 'csp="https://q.stripe.com/csp-report-v2?q=oVpjeE1FONF8rgOoyLub8uDA_4viyPn4AV3kbw8lEJ0wZuxZQlj83_fCETUGdRfkvr204d_5siIm3KcO&t=1"',
      'request-id': 'req_T0nwevNar4pMpF',
      'stripe-version': '2026-05-27.dahlia',
      vary: 'Origin',
      'x-stripe-priority-routing-enabled': 'true',
      'x-stripe-routing-context-priority-tier': 'api-testmode',
      'x-wc': '3c3',
      'strict-transport-security': 'max-age=63072000; includeSubDomains; preload'
    },
    statusCode: 400,
    requestId: 'req_T0nwevNar4pMpF'
  },
  rawType: 'invalid_request_error',
  code: 'parameter_invalid_empty',
  doc_url: 'https://stripe.com/docs/error-codes/parameter-invalid-empty',
  param: 'flow_data[subscription_update_confirm][items][0][id]',
  detail: undefined,
  headers: {
    server: 'nginx',
    date: 'Wed, 10 Jun 2026 14:58:01 GMT',
    'content-type': 'application/json',
    'content-length': '731',
    connection: 'keep-alive',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, HEAD, PUT, PATCH, POST, DELETE',
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'Request-Id, Stripe-Manage-Version, Stripe-Should-Retry, X-Stripe-External-Auth-Required, X-Stripe-Privileged-Session-Required',
    'access-control-max-age': '300',
    'cache-control': 'no-cache, no-store',
    'content-security-policy': "base-uri 'none'; default-src 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; script-src 'self' 'report-sample'; style-src 'self'; worker-src 'none'; upgrade-insecure-requests; report-uri https://q.stripe.com/csp-violation?q=oVpjeE1FONF8rgOoyLub8uDA_4viyPn4AV3kbw8lEJ0wZuxZQlj83_fCETUGdRfkvr204d_5siIm3KcO; report-to csp",
    'idempotency-key': 'stripe-node-retry-6975a61c-fa12-4c56-b3f8-12337e3b4076',
    'original-request': 'req_T0nwevNar4pMpF',
    'report-to': '{"group":"csp","max_age":8640,"endpoints":[{"url":"https://q.stripe.com/csp-report-v2?q=oVpjeE1FONF8rgOoyLub8uDA_4viyPn4AV3kbw8lEJ0wZuxZQlj83_fCETUGdRfkvr204d_5siIm3KcO&t=1"}],"include_subdomains":true}',
    'reporting-endpoints': 'csp="https://q.stripe.com/csp-report-v2?q=oVpjeE1FONF8rgOoyLub8uDA_4viyPn4AV3kbw8lEJ0wZuxZQlj83_fCETUGdRfkvr204d_5siIm3KcO&t=1"',
    'request-id': 'req_T0nwevNar4pMpF',
    'stripe-version': '2026-05-27.dahlia',
    vary: 'Origin',
    'x-stripe-priority-routing-enabled': 'true',
    'x-stripe-routing-context-priority-tier': 'api-testmode',
    'x-wc': '3c3',
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload'
  },
  requestId: 'req_T0nwevNar4pMpF',
  statusCode: 400,
  userMessage: undefined,
  charge: undefined,
  decline_code: undefined,
  payment_intent: undefined,
  payment_method: undefined,
  payment_method_type: undefined,
  setup_intent: undefined,
  source: undefined
}
 POST /api/checkout/stripe 500 in 1472ms (next.js: 118ms, application-code: 1354ms)
```