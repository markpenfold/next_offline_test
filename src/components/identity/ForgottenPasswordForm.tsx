// components/ForgotPasswordForm.tsx
'use client'

import { useActionState, useState } from 'react'
import { requestPasswordReset } from '@/actions/auth'
import styles from "@/app/styles/styles.module.css"
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
  <div className="mx-auto max-w-sm p-6">
     <h1>Reset Password</h1>
    <form action={handleSubmit} className="space-y-4">
      <p className="text-sm text-slate-600">
        Enter your email and we'll send you a link to get back into your account.
      </p>

      {(clientError || state?.error) && (
        <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded border border-red-200">
          {clientError || state?.error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full border p-2 rounded"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-black text-white p-2 rounded font-medium disabled:bg-gray-400 dynamic-transition"
        style={{ marginTop: '10px' }}
      >
        {isPending ? 'Sending...' : 'Send Reset Link'}
      </button>
    </form>
  </div>
)
}