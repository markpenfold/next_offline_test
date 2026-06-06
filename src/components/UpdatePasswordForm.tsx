// components/ResetPasswordForm.tsx
'use client'

import { useActionState, useState } from 'react' // New in Next.js 15/16
import styles from "@/app/styles/page.module.css"
import { resetPassword,  } from '@/actions/auth'
import { updatePasswordSchema } from '@/lib/validations/primitives'
import {type ActionState} from '@/lib/types'

export function UpdatePasswordForm() {
  // state is the return value of your server action
  // action is what you pass to the form's 'action' prop
  // isPending tells you if the server is still thinking
  const [state, action, isPending] = useActionState<ActionState, FormData>(resetPassword, null)
  // 2. Define the local state for Zod errors
  const [clientError, setClientError] = useState<string | null>(null)
  
  // Pass to zod for verification
  async function handleSubmit(formData: FormData) {
    setClientError(null);
    
    const rawData = Object.fromEntries(formData);
    const result = updatePasswordSchema.safeParse(rawData);

    if (!result.success) {
      // This catches "Passwords do not match" from your .refine() instantly
      setClientError(result.error.issues[0].message);
      return;
    }

    action(formData);
  }

  return (
    <form action={handleSubmit} className={styles.formContainer}>
      <h2>Set New Password</h2>
      
      {/* Show errors from the Server Action directly */}
      {state?.error && <p className={styles.errorText}>{state.error}</p>}

      <div className={styles.gap}>
        <label htmlFor="password">New Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Min 6 characters"
        />
      </div>

      <div className={styles.gap}>
        <label htmlFor="confirmPassword">Confirm New Password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          onChange={() => setClientError(null)} // Clear the "Passwords do not match" message
          type="password"
          required
          autoComplete="new-password"
        />
      </div>

      <div className={styles.gap2}>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Updating...' : 'Update Password'}
        </button>
      </div>
    </form>
  )
}