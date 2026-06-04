// 📄 src/components/auth/LogoutButton.tsx
'use client'

import { useState } from 'react';
import { logout } from '@/lib/auth/logout';
import { LogOut } from 'lucide-react'; // optional icon

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
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
    >
      <LogOut size={16} />
      {isClearing ? 'Clearing Lease...' : 'Sign Out'}
    </button>
  );
}