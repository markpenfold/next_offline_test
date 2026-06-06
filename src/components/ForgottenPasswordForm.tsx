// components/ForgotPasswordForm.tsx
'use client'

import { useActionState, useState } from 'react'
import { requestPasswordReset } from '@/actions/auth'
import styles from "@/app/styles/page.module.css"
import { forgotPasswordSchema } from '@/lib/validations/primitives'
import Link from 'next/link'

export function ForgottenPasswordForm() {
  const [state, action, isPending] = useActionState(requestPasswordReset, null)
  const [clientError, setClientError] = useState<string | null>(null)
  
  // Intercept the form submission to run Zod locally first
  const handleSubmit = async (formData: FormData) => {
    setClientError(null);
    const email = formData.get("email") as string;
    
    const result = forgotPasswordSchema.safeParse({ email });
    
    if (!result.success) {
      setClientError(result.error.issues[0].message);
      return; // Stop here, don't trigger the server action
    }

    action(formData); // All good, proceed to server
  }
  
  if (state?.success) {
    return (
      <div className={styles.successCard}>
        <h1>Check your inbox</h1>
        <p>{state.success}</p>
        <div className={styles.gap2}>
          <Link href="/login" className={styles.backButton}>
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form action={handleSubmit} className={styles.form}>
      <p>Enter your email and we'll send you a link to get back into your account.</p>

      {/* Show either Zod client errors or Supabase server errors */}
      {(clientError || state?.error) && (
        <p className={styles.error}>{clientError || state?.error}</p>
      )}

      <div className={styles.gap}>
        <label htmlFor="email">Email Address</label>
        <input id="email" name="email" type="email" required placeholder="you@example.com" />
      </div>

      <button type="submit" disabled={isPending}>
        {isPending ? 'Sending...' : 'Send Reset Link'}
      </button>
    </form>
  )
}