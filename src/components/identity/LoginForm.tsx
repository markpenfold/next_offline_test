// 📄 src/components/auth/LoginForm.tsx
'use client'

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/actions/auth';
import { Eye, EyeOff } from 'lucide-react';
import { useAppStore } from "@/providers/AppStoreProvider";
import styles from '@/app/styles/auth.module.css'; // Adjust path as needed

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isVisible, setIsVisible] = useState(false);
  const loginSuccess = useAppStore((s) => s.loginSuccess);

  const handleSubmit = async (formData: FormData) => {
    if (isPending) return; // Stop multi-click double execution dead in its tracks!
 
    setError(null); 

    startTransition(async () => {
      const result = await login(formData);
      

      if (!result.success || !result.payload) {
        setError(result.error || "Authentication failed.");
        return;
      }

      // 1. 🎯 THE UNIFIED CACHE: Only cache if valid credentials/token are generated
      if (result.payload.token) {
        console.log("Login recieved this payload:", result.payload)
        loginSuccess(result.payload);
      } 

      // 2. DYNAMIC ROUTING: Transitions to target URL
      router.push(result.payload.redirectUrl);
    });
  };

return (
  <div className={styles.container}>
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        handleSubmit(formData);
      }}
      className={styles.form}
    >
      <div className={styles.fieldGroup}>
        <label className={styles.label}>Email</label>
        <input name="email" type="email" required className={styles.input} />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label}>Password</label>
        <div className={styles.inputWrapper}>
          <input
            name="password"
            type={isVisible ? 'text' : 'password'}
            required
            className={`${styles.input} ${styles.passwordInput}`}
          />
          <button
            type="button"
            onClick={() => setIsVisible(!isVisible)}
            className={styles.eyeButton}
            aria-label={isVisible ? 'Hide password' : 'Show password'}
          >
            {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {error && <p className={styles.errorBox}>{error}</p>}

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? 'Establishing Link...' : 'Sign In'}
      </button>
    </form>
  </div>
);
}