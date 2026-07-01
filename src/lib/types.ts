// lib/types.ts
import type { User } from '@supabase/supabase-js'

export const TIERS = {
  FREE: 'free',
  PRO: 'pro',
  TEAM: 'team',
  FOUNDER: 'founder',
  NONE: 'none',
} as const;

// This generates the TypeScript union type: 'free' | 'pro' | 'team' | 'founder' | 'none'
export type UserTier = typeof TIERS[keyof typeof TIERS];

// --- DATABASE DOCKING LAYER RECORD TYPES ---
// (These exactly match your raw PostgreSQL table schema names)

export interface ProfileRecord {
  id: string;
  full_name: string | null;
  username: string;
  has_avatar: boolean;
}

export interface Account {
  id: string;
  name: string | null;
  plan_name: UserTier; // 🌟 Upgraded from string to strict UserTier
  subscription_status: string;
  is_personal: boolean;
}

// 🛡️ FIX: Removed the trailing array brackets. 
// A single membership row links back to exactly one account object.
export interface MembershipRecord {
  role: string;
  accounts: {
    id: string;
    name: string | null;
    plan_name: UserTier | null; // 🌟 Tightened type validation
    subscription_status: string;
    is_personal: boolean;
  } | null;
}

// --- FRONTEND CLIENT OPERATIONAL TYPES ---
// (These represent data after it has been mapped into memory states)

export interface AccountContext {
  id: string;
  name: string | null;
  plan_name: UserTier;         
  subscription_status: string; 
  role: string;
  is_personal: boolean;
}

export interface UserProfile {
  name: string | null;
  username: string | null;
  has_avatar: boolean; 
  email: string;
}

export interface LoginPayload {
  token: string;
  tier: UserTier;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    username: string;
    hasAvatar: boolean;
  };
  accounts: AccountContext[];
}

export interface LoginResult {
  success: boolean;
  error?: string;
  // 🛡️ FIX: Take everything from LoginPayload AND require a redirectUrl string!
  payload?: LoginPayload & {
    redirectUrl: string;
  };
}

// --- PROPS & UI RENDERING LAYER CONTRACTS ---

export interface DashboardUIProps {
  user: User;
  account: Account;
  message?: string;
}

export interface DashboardAccountProps {
  accountId: string;
  message?: string;
  session_id?: string;
}

export interface DashboardUserProps {
  user: User;
  account?: Account;
  message?: string;
}

export interface DashboardLoaderProps {
  session_id: string;
}

// --- GLOBAL UTILITIES & CORE ENGINE STATE ---

export const OFFLINE_CAPABLE_TIERS: UserTier[] = [
  TIERS.PRO,
  TIERS.TEAM,
  TIERS.FOUNDER
];

export function canWorkOffline(tier: UserTier): boolean {
  return OFFLINE_CAPABLE_TIERS.includes(tier);
}

export type ActionState = {
  error?: string;
  success?: boolean;
} | null;

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'unknown';

export interface AppState {
  authStatus: AuthStatus;
  isOnline: boolean;
  tier: UserTier;
  userId: string | null;
  profile: UserProfile | null;
  offlineLeaseJwt: string | null;
  activeAccount: AccountContext | null;
  accounts: AccountContext[];
  avatarVersion: string; 
  
  setAvatarVersion: (version: string) => void; 
  canAccessWorkspace: () => boolean;
  checkNetwork: () => Promise<boolean>;
  initializeWorkspace: () => Promise<void>;
  loginSuccess: (payload: LoginPayload) => void;
  logout: () => Promise<void>;
  
  hydrateFromCache: () => boolean;
  syncFromDatabase: () => Promise<void>;
  clearSlate: () => void;
  refreshTier: () => Promise<void>;
  setActiveAccount: (accChoice:AccountContext) => void;
}