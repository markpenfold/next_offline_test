"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/providers/AppStoreProvider";
import { useDATAStore } from "@/stores/useDataStore";
import { useUIStore } from "@/stores/useUIStore";

export default function OmenlandLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();

  // AppStore state & actions
  const authStatus = useAppStore((s) => s.authStatus);
  const activeAccount = useAppStore((s) => s.activeAccount);
  const canAccessWorkspace = useAppStore((s) => s.canAccessWorkspace);
  const initializeWorkspace = useAppStore((s) => s.initializeWorkspace);

  // DATAStore state & actions
  const { initializeOmenland, isInitialized } = useDATAStore();
  

  // 1. Initialize the App Engine on layout mount
  useEffect(() => {
    initializeWorkspace();
  }, [initializeWorkspace]);

  // 2. Handle workspace access & offline permissions
  useEffect(() => {
    if (authStatus === "authenticated") {
      // Check if user tier permits workspace access (online or cached offline)
      if (!canAccessWorkspace()) {
        router.replace("/pricing");
        return;
      }

      // Boot up local OPFS data engine once active account is available
      if (activeAccount?.id && !isInitialized) {
        initializeOmenland(activeAccount.id);
      }
    } else if (authStatus === "unauthenticated") {
      router.replace("/login");
    }
  }, [authStatus, activeAccount?.id, isInitialized, canAccessWorkspace, initializeOmenland, router]);

  // Render children immediately so local OPFS files and WebGL canvas load without lag
  return <>{children}</>;
}