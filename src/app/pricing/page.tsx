'use client'

import classes from '@/app/styles/other.module.css'
import Link from 'next/link' //
import { CheckoutButton } from '@/components/CheckoutButton'
import { useSearchParams } from 'next/navigation'
import { tier_details } from '@/lib/utils/constants'
import { useAppStore } from "@/providers/AppStoreProvider";
import { SiteNav } from '@/components/SiteNav'


export default function PricingPage() {

    const isOnline = useAppStore((s) => s.isOnline);
    const currentTier = useAppStore((s) => s.tier);
    const profile = useAppStore((s) => s.profile);
    const authStatus = useAppStore((s) => s.authStatus);
    const checkNetwork = useAppStore((s) => s.checkNetwork);
    const searchParams = useSearchParams()
    const error = searchParams.get('error')

  
  return (

    <>
    <SiteNav />
    <div className={classes.pageContainer}>
      
      {error === 'session_expired' && (
        <div style={{ color: 'red', padding: '10px', border: '1px solid red' }}>
         Your signup session expired or was invalid. Please try selecting your plan again.
        </div>
      )}
      <div className={classes.pageSection}>
        <h1>Choose your plan</h1>
      </div>
     
      
      <div className={classes.priceContainer}>
        
        {/* walk through the list of tiers and create cards
            will also need a list of benefits per tier  */}
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
                <button className={classes.buttonClass} style={{ backgroundColor:'#035503' }}>
                  Cancel
                </button>
                
              ) : !profile ? (
                // Scenario B: Anonymous visitor. Send them to registration.
                <Link href={`/signup?plan=${tier.id}`} className={classes.buttonClass}>
                  Sign up
                </Link>
              )  : (
                // Scenario D: Logged in, purchasing a premium tier. Fires secure POST directly to Stripe.
                <CheckoutButton plan={tier.id} className={classes.buttonClass}>
                  Switch
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