// src>lib>auth>logout.ts

import { createClient } from '@/lib/supabase/client'; // Your client-side supabase initializer
import { useAppStore } from '@/providers/AppStoreProvider';

export function logout() {
  const storeLogout = useAppStore((state) => state.logout);
  const supabase = createClient();

  const executeLogout = async () => {
    // 1. Terminate the database session token on the server
    await supabase.auth.signOut();

    // 2. Clear out local state and storage
    await storeLogout();

    // 3. Hard redirect back to login to force a full clean window lifecycle
    window.location.href = '/';
  };

  return { executeLogout };
}