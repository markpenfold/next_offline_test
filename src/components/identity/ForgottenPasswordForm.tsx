'use client'

import { useActionState, useState } from 'react'
import { requestPasswordReset } from '@/actions/auth'
import styles from '@/app/styles/auth.module.css'
import { forgotPasswordSchema } from '@/lib/validations/primitives'
import Link from 'next/link'

export function ForgottenPasswordForm() {
  const [state, action, isPending] = useActionState(requestPasswordReset, null)
  const [clientError, setClientError] = useState<string | null>(null)
  
  const handleSubmit = async (formData: FormData) => {
    setClientError(null);
    const email = formData.get("email") as string;
    
    const result = forgotPasswordSchema.safeParse({ email });
    
    if (!result.success) {
      setClientError(result.error.issues[0].message);
      return;
    }

    action(formData);
  }
  
  if (state?.success) {
    return (
      <div className={styles.successCard}>
        <h1>Check your inbox</h1>
        <p>{state.success}</p>
        <div>
          <Link href="/login" className={styles.backButton}>
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Reset Password</h1>
      <form action={handleSubmit} className={styles.form}>
        <p className={styles.description}>
          Enter your email and we'll send you a link to get back into your account.
        </p>

        {(clientError || state?.error) && (
          <p className={styles.errorBox}>
            {clientError || state?.error}
          </p>
        )}

        <div className={styles.fieldGroup}>
          <label htmlFor="email" className={styles.label}>
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className={styles.input}
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className={styles.submitButton}
        >
          {isPending ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
    </div>
  )
}