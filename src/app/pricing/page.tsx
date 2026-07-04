'use client'

import classes from '@/app/styles/other.module.css'
import Link from 'next/link'
import { CheckoutButton } from '@/components/CheckoutButton'
import { useSearchParams } from 'next/navigation'
import { tier_details } from '@/lib/utils/constants'
import { useAppStore } from "@/providers/AppStoreProvider";
import { SiteNav } from '@/components/SiteNav'
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
          <h1>Choose your plan</h1>
        </div>
       
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
      </div>
    </>
  )
}