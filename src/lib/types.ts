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