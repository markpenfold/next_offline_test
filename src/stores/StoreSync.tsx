// src/components/StoreSync.tsx
'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';
import { initAutoSaveWatcher, debouncedSave } from "@/stores/initAutoSave";


export function StoreSync() {
  const activeAccount = useAppStore((s) => s.activeAccount);
  const userId = useAppStore((s) => s.userId);
  const initWebGPUSupport = useUIStore((state) => state.initWebGPUSupport);

  useEffect(() => {
    // 1. Initialize auto-save subscription
    const cleanup = initAutoSaveWatcher();

    // 2. Handle browser tab closes / refreshes
    const handleBeforeUnload = () => {
      debouncedSave?.flush?.();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      cleanup();
    };
  }, []);


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