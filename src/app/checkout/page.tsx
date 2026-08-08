
import { createClient } from '@/lib/supabase/server'
import { SignupForm } from '@/components/identity/SignupForm'
import { redirect } from 'next/navigation'
import classes from '@/app/styles/styles.module.css'

interface CheckoutPageProps {
  searchParams: Promise<{ plan?: string }>
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser()

  // 1. Guard Rail: Strictly block unauthenticated traffic
  if (!user || !user.id){
    redirect('/login?message=Please log in to continue.')
  }
  
  const resolvedParams = await searchParams
  const selectedPlan = resolvedParams.plan || 'free' // Fallback to free if empty

  // 2. If they chose the "Free" plan, they don't need Stripe! Send them right to the dashboard.
  if (selectedPlan === 'free') {
    console.log("plan selected is FREEEEEEE£E")
    redirect('/dashboard?message=Welcome to your Free workspace!')
  }
console.log("plan selected is, ", selectedPlan)
// 3. Pass control to your local API route securely, using the verified server session user.id
  redirect(`/api/checkout/stripe?plan=${selectedPlan}&userId=${user.id}&email=${encodeURIComponent(user.email || '')}`)
}