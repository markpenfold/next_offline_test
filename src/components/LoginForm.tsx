// 📄 src/components/auth/LoginForm.tsx
'use client'

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/actions/auth';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    setError(null); 

    startTransition(async () => {
      const result = await login(formData);

      if (!result.success || !result.payload) {
        setError(result.error || "Authentication failed.");
        return;
      }

      // 1. 🎯 THE UNIFIED CACHE: Only cache if valid credentials/token are generated
      if (result.payload.token) {
        localStorage.setItem('jungle_lease_v2', JSON.stringify({
          token: result.payload.token,
          user: result.payload.user,
          accounts: result.payload.accounts
        }));
      }

      // 2. 🚀 DYNAMIC ROUTING: Transitions beautifully to target URL
      router.push(result.payload.redirectUrl);
    });
  };

  return (
    <div className="mx-auto max-w-sm p-6">
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input name="email" type="email" required className="w-full border p-2 rounded" />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input name="password" type="password" required className="w-full border p-2 rounded" />
        </div>

        {error && (
          <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded border border-red-200">
            {error}
          </p>
        )}

        <button 
          type="submit" 
          disabled={isPending}
          className="w-full bg-black text-white p-2 rounded font-medium disabled:bg-gray-400 dynamic-transition"
        >
          {isPending ? 'Establishing Link...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}