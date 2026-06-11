"use client"; // Required for Next.js App Router if using hooks

import React, { useState, useEffect } from 'react';
import { useAppStore } from "@/providers/AppStoreProvider";
import { getUserBillingPeriod } from '@/lib/utils/stripeHelpers'


export async function DashboardAccountUI(){

    const isOnline = useAppStore((s) => s.isOnline);
    const tier = useAppStore((s) => s.tier);
    const profile = useAppStore((s) => s.profile);
    const authStatus = useAppStore((s) => s.authStatus);
    const activeAccount = useAppStore((s) => s.activeAccount);
    const checkNetwork = useAppStore((s) => s.checkNetwork);


    return (
    <div>
        <h1>ACCOUNT!</h1>
        <div>TIER: {tier}</div>
        <div>USER: {profile?.username}</div>
        <div>NAME:  {profile?.name}</div>
        <div>EMAIL:  {profile?.email}</div>
        <div>WORKSPACE: {activeAccount}  </div>
    </div>
    );
}