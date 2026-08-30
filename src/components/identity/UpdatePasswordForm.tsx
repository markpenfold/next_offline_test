'use client';

import React, { useState, useActionState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { resetPassword } from '@/actions/auth';
import styles from '@/app/styles/auth.module.css';

export function UpdatePasswordForm() {
  const [state, formAction, isPending] = useActionState(resetPassword, null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  return (
    <form action={formAction} className={styles.formWrapper}>
      {(clientError || state?.error) && (
        <p className={styles.errorBox}>{clientError || state?.error}</p>
      )}

      {/* New Password */}
      <div className={styles.fieldGroup}>
        <label htmlFor="password" className={styles.label}>
          New Password
        </label>
        <div className={styles.inputWrapper}>
          <input
            id="password"
            name="password"
            type={isPasswordVisible ? 'text' : 'password'}
            required
            autoComplete="new-password"
            placeholder="Min 6 characters"
            className={styles.input}
          />
          <button
            type="button"
            onClick={() => setIsPasswordVisible(!isPasswordVisible)}
            className={styles.eyeButton}
            aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
          >
            {isPasswordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Confirm Password */}
      <div className={styles.fieldGroup}>
        <label htmlFor="confirmPassword" className={styles.label}>
          Confirm New Password
        </label>
        <div className={styles.inputWrapper}>
          <input
            id="confirmPassword"
            name="confirmPassword"
            onChange={() => setClientError(null)}
            type={isConfirmVisible ? 'text' : 'password'}
            required
            autoComplete="new-password"
            className={styles.input}
          />
          <button
            type="button"
            onClick={() => setIsConfirmVisible(!isConfirmVisible)}
            className={styles.eyeButton}
            aria-label={isConfirmVisible ? 'Hide password' : 'Show password'}
          >
            {isConfirmVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? 'Updating...' : 'Update Password'}
      </button>
    </form>
  );
}