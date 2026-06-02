// lib/constants.ts

export const AVATAR_BUCKET_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars`;

export const getAvatarUrl = (userId: string, hasAvatar: boolean, name: string) => {
  if (!hasAvatar) {
    console.log("no avatar")
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
  }
  console.log("sending this imnage:", `${AVATAR_BUCKET_URL}/${userId}/avatar.png` )
  return `${AVATAR_BUCKET_URL}/${userId}/avatar.png`;
};


export const DuckDBConfig = {
  CDN_WORKER: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-browser-mvp.worker.js',
  CDN_MODULE: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/dist/duckdb-mvp.wasm',
  DB_NAME: 'local_timeline_vault.db',
};


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