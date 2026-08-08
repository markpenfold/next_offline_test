// 📄 src/components/auth/LogoutButton.tsx
'use client'

import { useState } from 'react';
import { logout } from '@/lib/auth/logout';
import { Eclipse } from 'lucide-react'; // optional icon
import classes from '@/app/styles/styles.module.css'

export function LogoutButton() {
  const { executeLogout } = logout();
  const [isClearing, setIsClearing] = useState(false);

  const handleSignOut = async () => {
    if (isClearing) return;
    setIsClearing(true);
    await executeLogout();
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={isClearing}
      className={classes.signInOutButton} >

      {isClearing ? 'Clearing Lease...' : 'Sign Out'}
    </button>
  );
}