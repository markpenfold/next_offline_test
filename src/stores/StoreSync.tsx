// src/components/StoreSync.tsx
'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';


export function StoreSync() {
  const activeAccount = useAppStore((s) => s.activeAccount);
  const userId = useAppStore((s) => s.userId);
  const initWebGPUSupport = useUIStore((state) => state.initWebGPUSupport);

  useEffect(() => {
    const accountId = activeAccount?.id || userId || null;
    useDATAStore.setState({ accountId }); // Directly patch DATAStore state without an action
  }, [activeAccount, userId]);

  useEffect(() => {
    const accountId = activeAccount?.id || userId || null;

    if (accountId) {
      // Sync account ID & load OPFS webGPUStatus.json
      initWebGPUSupport(accountId);
    }
  }, [activeAccount, userId, initWebGPUSupport]);

  return null;
}