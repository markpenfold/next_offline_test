'use client'

import { useState } from 'react'

interface CheckoutButtonProps {
  plan: string
  className: string
  children: React.ReactNode
}

export function CheckoutButton({ plan, className, children }: CheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleCheckout = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/checkout/stripe/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
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
      disabled={isLoading}
      className={className}
      style={{ cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.7 : 1 }}
    >
      {isLoading ? 'Processing...' : children}
    </button>
  )
}