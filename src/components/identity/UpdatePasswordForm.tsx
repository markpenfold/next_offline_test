'use client'

import { useActionState, useState, useEffect } from 'react' // 🟢 Added useEffect
import { resetPassword } from '@/actions/auth'
import { updatePasswordSchema } from '@/lib/validations/primitives'
import { type ActionState } from '@/lib/tl_utils/types'
import { Eye, EyeOff } from 'lucide-react'

export function UpdatePasswordForm() {
  const [state, action, isPending] = useActionState<ActionState, FormData>(resetPassword, null)
  const [clientError, setClientError] = useState<string | null>(null)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmVisible, setIsConfirmVisible] = useState(false)
  
  // 🟢 Watch the Server Action state. When it reports success, force a hard redirect.
  useEffect(() => {
    if (state?.success) {
      window.location.href = '/dash'
    }
  }, [state])

  async function handleSubmit(formData: FormData) {
    setClientError(null);
    
    const rawData = Object.fromEntries(formData);
    const result = updatePasswordSchema.safeParse(rawData);

    if (!result.success) {
      setClientError(result.error.issues[0].message);
      return;
    }

    action(formData);
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-900">Set New Password</h2>
      
      <form action={handleSubmit} className="space-y-4">
        
        {/* 🟢 Render local client validation errors (like "Passwords do not match") */}
        {clientError && (
          <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded border border-red-200">
            {clientError}
          </p>
        )}

        {/* Render errors returned straight from the database/server */}
        {state?.error && !clientError && (
          <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded border border-red-200">
            {state.error}
          </p>
        )}

        {/* New Password Field */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            New Password
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              id="password"
              name="password"
              type={isPasswordVisible ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="Min 6 characters"
              className="w-full border p-2 rounded pr-10"
            />
            <button
              type="button"
              onClick={() => setIsPasswordVisible(!isPasswordVisible)}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label={isPasswordVisible ? "Hide password" : "Show password"}
            >
              {isPasswordVisible ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {/* Confirm Password Field */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
            Confirm New Password
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              id="confirmPassword"
              name="confirmPassword"
              onChange={() => setClientError(null)} // Clear the message when typing
              type={isConfirmVisible ? 'text' : 'password'}
              required
              autoComplete="new-password"
              className="w-full border p-2 rounded pr-10"
            />
            <button
              type="button"
              onClick={() => setIsConfirmVisible(!isConfirmVisible)}
              style={{
                position: 'absolute',
                right: '10px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label={isConfirmVisible ? "Hide password" : "Show password"}
            >
              {isConfirmVisible ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={isPending}
          className="w-full bg-black text-white p-2 rounded font-medium disabled:bg-gray-400 dynamic-transition"
          style={{ marginTop: '10px' }}
        >
          {isPending ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </div>
  )
}