// 📄 src/components/auth/LoginForm.tsx
'use client'

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/actions/auth';
import { Eye, EyeOff } from 'lucide-react';
import { useAppStore } from "@/providers/AppStoreProvider";

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
    <div className="mx-auto max-w-sm p-6">
      <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          handleSubmit(formData);
        }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input name="email" type="email" required className="w-full border p-2 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input 
              name="password" 
              type={isVisible ? 'text' : 'password'} 
              required 
              className="w-full border p-2 rounded pr-10" 
            />
            <button
              type="button"
              onClick={() => setIsVisible(!isVisible)}
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
              aria-label={isVisible ? "Hide password" : "Show password"}
            >
              {isVisible ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
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
       style={{marginTop: '10px'}} >
          {isPending ? 'Establishing Link...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}