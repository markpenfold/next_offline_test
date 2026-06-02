// src/lib/auth/hydrat_user.ts
import type { User } from '@supabase/supabase-js';
import { Profile } from '@/lib/types'

export interface OfflineHydrationKit {
  user: User;
  profile: Profile | null;
  memberships: any[];
  offlineLeaseJwt: string;
}

/**
 * Seeds the browser's localStorage with all critical baseline data
 * needed to run the entire dashboard layout 100% offline.
 */
export function seedOfflineEngine(kit: OfflineHydrationKit): void {
  if (typeof window === 'undefined') return; // Safety check for SSR passes

  const { user, profile, memberships, offlineLeaseJwt } = kit;

  localStorage.setItem('omen_offline_user', JSON.stringify(user));
  localStorage.setItem('omen_offline_profile', JSON.stringify(profile));
  localStorage.setItem('omen_offline_memberships', JSON.stringify(memberships));
  localStorage.setItem('omen_offline_lease_jwt', offlineLeaseJwt);
  
  // Initialize a fresh sync queue for tracking offline changes
  localStorage.setItem('omen_sync_outbox', JSON.stringify([]));
}

/**
 * Clears out all local-first sessions upon logout.
 */
export function clearOfflineEngine(): void {
  if (typeof window === 'undefined') return;
  
  localStorage.removeItem('omen_offline_user');
  localStorage.removeItem('omen_offline_profile');
  localStorage.removeItem('omen_offline_memberships');
  localStorage.removeItem('omen_offline_lease_jwt');
  localStorage.removeItem('omen_sync_outbox');
}