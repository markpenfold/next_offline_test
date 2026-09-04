'use client'

import classes from '@/app/styles/pricing.module.css'
import Link from 'next/link'
import { CheckoutButton } from '@/components/identity/CheckoutButton'
import { useSearchParams } from 'next/navigation'
import { tier_details } from '@/lib/utils/constants'
import { useAppStore } from "@/providers/AppStoreProvider";
import { SiteNav } from '@/components/identity/SiteNav'
import { Suspense } from 'react'
import { Check } from 'lucide-react'

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
        
        <Suspense fallback={null}>
          <ErrorBanner />
        </Suspense>

        <div className={classes.pageSection}>
          <div className={classes.wideCentralHeader}>
            <h1>Discover the Omenland</h1>
            <p className={classes.subHeader}>Choose the plan that fits your historical ambitions</p>
          </div>
        </div>
       
        <div className={classes.priceContainer}>
          {tier_details.map((tier) => {
            const isCurrentPlan = currentTier === tier.id;
            const isFree = tier.id === 'free';
            const isAvailable = isFree;

            return (
              <div 
                key={tier.id} 
                className={`${classes.priceBox} ${!isAvailable ? classes.disabledCard : ''}`}
              >

                {isCurrentPlan ? (
                  <div className={classes.current_tag}>CURRENT PLAN</div>
                ) : !isAvailable ? (
                  <div className={`${classes.current_tag} ${classes.comingSoonTag}`}>COMING SOON</div>
                ) : null}

                {/* Fixed-height header wrapper keeps benefits aligned horizontally across cards */}
                <div className={classes.cardHeader}>
                  <h3>{tier.name}</h3>
                  <div className={classes.priceText}>{tier.price}</div>
                </div>

                {/* Benefits list with Lucide Check Icon */}
                <ul className={classes.bensList}>
                  {tier.bens.map((benefit, index) => (
                    <li key={index} className={classes.benItem}>
                      <Check size={16} className={classes.checkIcon} />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>

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
                  <button className={`${classes.buttonClass} ${classes.disabledBtn}`} disabled>
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