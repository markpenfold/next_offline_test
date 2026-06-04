// lib/types.ts
import type { User} from '@supabase/supabase-js'


export interface Profile {
  id: string
  full_name: string | null
  has_avatar: boolean
  username: string
}

export interface Account {
  id: string;
  name: string | null;
  plan_name: string;
  subscription_status: string;
  is_personal: boolean;
}

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
  user: User ;
  account?: Account;
  message?: string;
}


export interface DashboardLoaderProps {
  session_id: string;
}



export interface AccountContext {
  id: string;
  name: string | null;
  tier: UserTier;
  subscriptionStatus: string;
  role: string;
  isPersonal: boolean;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  payload?: {
    token: string;
    redirectUrl: string;
    tier: UserTier;                  // 🆕 Exposes the calculated primary operational tier
    user: {
      id: string;
      email: string | null;
      name: string | null;
      username: string;
      hasAvatar: boolean;
    };
    accounts: AccountContext[];       // ⚡ Array guaranteed to be sorted by 'owner' priority from the server
  };
}

// Define the shape of the data returned by your join query
export interface MembershipRecord {
  role: string;
  accounts: {
    id: string;
    name: string;
    plan_name: string | null;
    subscription_status: string;
    is_personal: boolean;
  }[];
}

export interface ProfileRecord {
  id: string;
  full_name: string | null;
  username: string;
  has_avatar: boolean;
}



export const TIERS = {
  FREE: 'free',
  PRO: 'pro',
  TEAM: 'team',
  FOUNDER: 'founder',
} as const;

// 🎯 This generates the TypeScript union type: 'free' | 'pro' | 'team' | 'founder'
export type UserTier = typeof TIERS[keyof typeof TIERS];

// 🌲 Configuration array defining which tiers get access to the offline engine
export const OFFLINE_CAPABLE_TIERS: UserTier[] = [
  TIERS.PRO,
  TIERS.TEAM,
  TIERS.FOUNDER
];

/**
 * Clean helper to check if a specific tier is allowed to operate in the jungle.
 */
export function canWorkOffline(tier: UserTier): boolean {
  return OFFLINE_CAPABLE_TIERS.includes(tier);
}