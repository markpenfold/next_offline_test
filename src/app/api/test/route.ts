import { NextRequest, NextResponse } from 'next/server'
import { getActiveUserAccount, setUpStripeCustomer } from '@/lib/supabase/queries'

// url: http://localhost:3000/api/test?userId=3a808c88-df74-46d5-8f4d-d4cb012bafbe
export async function GET(request: NextRequest) {
  // 1. Grab a test user ID from the URL search params
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'Provide a ?userId=... param' }, { status: 400 })
  }

  try {
    // 2. Call your function
    const result = await getActiveUserAccount(userId)

    if(result){

    // 🎯 Defensive check: Extract the object whether it's an array OR a direct object
      const accountContext = Array.isArray(result.accounts)
        ? result.accounts[0]
        : result.accounts

      const stripeCustomerId = accountContext?.stripe_customer_id

  if (!stripeCustomerId) {
    console.log("No Stripe Customer ID found.")
    const r2 = setUpStripeCustomer(result.account_id, userId);
    console.log("FROM /test: created stripe customer I hope:", r2)
    
  }else{
    console.log("Stripe Customer ID found.",stripeCustomerId )
  }
    }
    // 3. Spit out the database response directly to the screen
    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}