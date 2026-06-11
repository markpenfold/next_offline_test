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

export  const tier_details = [
    { name: 'Free', id: 'free', price: '£0', type: 'signup' },
    { name: 'Pro', id: 'pro', price: '£10/Mo', type: 'premium' },
    { name: 'Team', id: 'team', price: '£9/Mo Per member', type: 'premium' },
    { name: 'Founder', id: 'founder', price: '£120/Year', type: 'premium' },
  ]


 export const PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRICE_PRO!,
  team: process.env.STRIPE_PRICE_TEAM!,
  founder: process.env.STRIPE_PRICE_FOUNDER!,
}
