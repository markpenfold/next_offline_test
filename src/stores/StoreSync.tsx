// src/components/StoreSync.tsx
'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/providers/AppStoreProvider';
import { useDATAStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';
import { initAutoSaveWatcher, debouncedSave } from "@/stores/initAutoSave";

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastResult: ReturnType<T> | undefined = undefined;

  const debounced = (...args: Parameters<T>): ReturnType<T> | undefined => {
    lastArgs = args;

    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      if (lastArgs) {
        lastResult = fn(...lastArgs);
        timer = null;
        lastArgs = null;
      }
    }, delay);

    return lastResult;
  };

  // Immediately executes any pending invocation
  debounced.flush = (): ReturnType<T> | undefined => {
    if (timer && lastArgs) {
      clearTimeout(timer);
      lastResult = fn(...lastArgs);
      timer = null;
      lastArgs = null;
    }
    return lastResult;
  };

  // Cancels any pending execution without running it
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  return debounced;
}

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