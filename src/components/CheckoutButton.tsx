'use client'

import { useState } from 'react'

interface CheckoutButtonProps {
  plan: string
  activeAccount:string | null
  className: string
  children: React.ReactNode
}

export function CheckoutButton({ plan, activeAccount, className, children }: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const isDisabled = isLoading || !activeAccount

  const handleCheckout = async () => {
    if (!activeAccount) {
      console.warn('[Checkout] Intercepted click: activeAccount is null.')
      alert('Your workspace account data is still loading. Please wait a moment and try again.')
      return
    }


    setIsLoading(true)
    try {
      const res = await fetch('/api/checkout/stripe/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, activeAccount }),
      })

      const data = await res.json()

      if (data.url) {
        // Safe cross-origin window shift to Stripe
        window.location.href = data.url
      } else {
        alert(data.error || 'Something went wrong. Please try again.')
        setIsLoading(false)
      }
    } catch (err) {
      console.error('Checkout initialization error:', err)
      alert('Network error. Please check your connection.')
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleCheckout}
      disabled={isDisabled}
      className={className}
      style={{ cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1 }}
    >
      {isLoading ? (
        'Processing...'
      ) : !activeAccount ? (
        'Loading Account ...' //User-friendly indicator
      ) : (
        children
      )}
    </button>
  )
}