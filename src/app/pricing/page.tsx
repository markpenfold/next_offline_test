'use client'

import classes from '@/app/styles/pricing.module.css'
import Link from 'next/link'
import { CheckoutButton } from '@/components/identity/CheckoutButton'
import { useSearchParams } from 'next/navigation'
import { tier_details } from '@/lib/utils/constants'
import { useAppStore } from "@/providers/AppStoreProvider";
import { SiteNav } from '@/components/identity/SiteNav'
import { Suspense } from 'react'

// 1. Move the error element into its own sub-component
function ErrorBanner() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  if (error !== 'session_expired') return null

  return (
    <div style={{ color: 'red', padding: '10px', border: '1px solid red', marginBottom: '20px' }}>
      Your signup session expired or was invalid. Please try selecting your plan again.
    </div>
  )
}

export default function PricingPage() {
  const currentTier = useAppStore((s) => s.tier);
  const profile = useAppStore((s) => s.profile);
  const activeAccount = useAppStore((s) => s.activeAccount);

  return (
    <>
      <SiteNav />
      <div className={classes.pageContainer}>
        
        {/* 2. Wrap only the parameter consumer inside Suspense */}
        <Suspense fallback={null}>
          <ErrorBanner />
        </Suspense>

        <div className={classes.pageSection}>
          <div className={classes.wideCentralHeader}>
            <h1>Discover the Omenland</h1>
            <br/><br/>
          </div>
        </div>
       
        <div className={classes.priceContainer}>
  {tier_details.map((tier) => {
    const isCurrentPlan = currentTier === tier.id;
    const isFree = tier.id === 'free'; // Adjust to match your exact free plan ID
    const isAvailable = isFree;

    return (
      <div key={tier.id} className={classes.priceBox}>
        {/* Badges - uses the exact same current_tag styling */}
        {isCurrentPlan ? (
          <div className={classes.current_tag}>
            CURRENT PLAN
          </div>
        ) : !isAvailable ? (
          <div className={classes.current_tag}>
            COMING SOON
          </div>
        ) : null}

        <h3>{tier.name}</h3>
        <div>{tier.price}</div>

        {/* Action Buttons */}
        {isCurrentPlan ? (
          <button className={classes.buttonClass} style={{ backgroundColor: '#035503' }}>
            Cancel
          </button>
        ) : isAvailable ? (
          !profile ? (
            <Link href={`/signup?plan=${tier.id}`} className={classes.buttonClass}>
              Sign up
            </Link>
          ) : (
            <CheckoutButton plan={tier.id} activeAccount={activeAccount} className={classes.buttonClass}>
              Switch
            </CheckoutButton>
          )
        ) : (
          /* Greyed-out button for Coming Soon tiers */
          <button 
            className={classes.buttonClass} 
            style={{ 
              backgroundColor: '#d1d5db', 
              color: '#9ca3af', 
              cursor: 'not-allowed' 
            }} 
            disabled
          >
            {!profile ? 'Sign up' : 'Switch'}
          </button>
        )}
      </div>
    );
  })}
</div>
      </div>
    </>
  )
}


/*
//Return this once paying customers are invited....
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

                {isCurrentPlan ? (
                  <button className={classes.buttonClass} style={{ backgroundColor:'#035503' }}>
                    Cancel
                  </button>
                ) : !profile ? (
                  <Link href={`/signup?plan=${tier.id}`} className={classes.buttonClass}>
                    Sign up
                  </Link>
                ) : (
                  <CheckoutButton plan={tier.id} activeAccount={activeAccount} className={classes.buttonClass}>
                    Switch
                  </CheckoutButton>
                )}
              </div>
            )
          })}
        </div>
         */