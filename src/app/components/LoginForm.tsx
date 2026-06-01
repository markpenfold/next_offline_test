// components/LoginForm.tsx  (Client Component)
'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/actions/auth'
import styles from '@/app/styles/styles.module.css';
import { seedOfflineEngine } from '@/lib/auth/hydrate_user'

export function LoginForm() {
  const searchParams = useSearchParams()
  
  const router = useRouter()
  // We use local state for errors now, making failed attempts instant and smooth
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const result = await login(formData)

    // 1. Handle validation/credential errors gracefully
    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // 2. 🌐 THE HYDRATION MOMENT: We are safely in the browser!
    if (result?.success && result.payload) {
      
      // Single, clean entry point to boot up the offline engine
      seedOfflineEngine(result.payload);
      
      // Trigger a client-side route transition
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl
      }
    }
  }

  return (
   <form onSubmit={handleSubmit}>
      {/* Show smooth, state-based errors without reloading the page */}
      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.p4}>
        <label className={styles.p4} htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={loading}
        />
      </div>

      <div className={styles.p4}>
        <label className={styles.p4} htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={loading}
        />
      </div>
      
      <div className={styles.p4}>
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </div>
    </form>
  )
}