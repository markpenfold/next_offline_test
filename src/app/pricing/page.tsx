'use client'

import classes from '@/app/styles/styles.module.css'
import Link from 'next/link' //
import { CheckoutButton } from '@/components/CheckoutButton'
import { useSearchParams } from 'next/navigation'
import { tier_details } from '@/lib/utils/constants'
import { useAppStore } from "@/providers/AppStoreProvider";
import { SiteNav } from '@/components/SiteNav'


// Simple helper to check active subscription tier state
function get_plan(id: string) {
  // Replace this placeholder with a database fetch down the line
  return 'free' 
}

export default function PricingPage() {

    const isOnline = useAppStore((s) => s.isOnline);
    const currentTier = useAppStore((s) => s.tier);
    console.log("THE TIER: ", currentTier)
    const profile = useAppStore((s) => s.profile);
    console.log("THE PROFILE: ", profile)
    const authStatus = useAppStore((s) => s.authStatus);
    const checkNetwork = useAppStore((s) => s.checkNetwork);

    const searchParams = useSearchParams()
    const error = searchParams.get('error')

  

  // Helper array to keep the HTML rendering neat, organized, and DRY


  return (

    <>
    <SiteNav />
    <div className={classes.pageContainer}>
      
      {error === 'session_expired' && (
        <div style={{ color: 'red', padding: '10px', border: '1px solid red' }}>
         Your signup session expired or was invalid. Please try selecting your plan again.
        </div>
      )}
      
        <h1>Choose your plan</h1>
     
      
      <div className={classes.priceContainer}>
        {tier_details.map((tier) => {
          const isCurrentPlan = currentTier === tier.id

          return (
            
            <div key={tier.id} className={classes.priceBox}>
              {isCurrentPlan && (
                <div className={classes.current_tag}>
                  Current Plan
                </div>
              )}
              <h3>{tier.name}</h3>
              <div>{tier.price}</div>

              {/* DYNAMIC ACTION BUTTON GENERATOR */}
              {isCurrentPlan ? (
                // Scenario A: User is looking at their current subscription
                <button disabled className={classes.buttonClass} style={{ opacity: 0.5 }}>
                  Cancel
                </button>
                
              ) : !profile ? (
                // Scenario B: Anonymous visitor. Send them to registration.
                <Link href={`/signup?plan=${tier.id}`} className={classes.buttonClass}>
                  Sign up
                </Link>
              ) : tier.id === 'free' ? (
                // Scenario C: Logged in, wanting to downgrade to free (Handle via account panel normally)
                <Link href="/dash" className={classes.buttonClass}>
                  Downgrade
                </Link>
              ) : (
                // Scenario D: Logged in, purchasing a premium tier. Fires secure POST directly to Stripe.
                <CheckoutButton plan={tier.id} className={classes.buttonClass}>
                  Upgrade
                </CheckoutButton>
              )}
            </div>
          )
        })}
      </div>
    </div>
    </>
    
  )
}