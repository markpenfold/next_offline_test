"use client";

import React, { useEffect, useState } from "react";
import { useAppStore } from "@/providers/AppStoreProvider";
import { useDATAStore } from "@/stores/useDataStore";
export default function OmenlandLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 1. Trigger the bootloader hook
  // const isWorkspaceReady = useInitializeWorkspace();


const activeAccount  = useAppStore((s) => s.activeAccount);
const { initializeOmenland, isInitialized } = useDATAStore();

useEffect(() => {
  if (activeAccount?.id && !isInitialized) {
    initializeOmenland(activeAccount.id);
  }
}, [activeAccount?.id, isInitialized, initializeOmenland]);
  // 3. Render the actual workspace once ready.
  // If omenland has a specific Sidebar or Top Navigation that belongs 
  // on every workspace page, you wrap `children` with it here.
  return (
    <>
     {children}
    </>
  );
}