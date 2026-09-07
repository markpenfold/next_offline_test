// ConnectivityMonitor.tsx

'use client';

import { useEffect } from 'react';
import { useConnectivityStore } from '@/stores/useConnectivityStore';

export function ConnectivityMonitor() {
  useEffect(() => {
    const handleOffline = () => {
      useConnectivityStore.getState().setNetworkStatus('offline');
    };

    const handleOnline = () => {
      useConnectivityStore.getState().setNetworkStatus('online');
      useConnectivityStore.getState().checkR2();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Initial state
    if (!navigator.onLine) {
      handleOffline();
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return null;
}