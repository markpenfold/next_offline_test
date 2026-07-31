// src/components/StoreSync.tsx
'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';

export function StoreSync() {
  const activeAccount = useAppStore((s) => s.activeAccount);
  const userId = useAppStore((s) => s.userId);

  useEffect(() => {
    const accountId = activeAccount?.id || userId || null;
    useDATAStore.setState({ accountId }); // Directly patch DATAStore state without an action
  }, [activeAccount, userId]);

  return null;
}