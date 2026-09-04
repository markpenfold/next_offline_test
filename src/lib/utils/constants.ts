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
    { name: 'Free', id: 'free', price: '£0', type: 'signup', bens:['base data', 'publish your work', ] },
    { name: 'Pro', id: 'pro', price: '£10/Mo', type: 'premium', bens:['base data','more data', 'offline mode', 'publish your work','export your work',  ]  },
    { name: 'Team', id: 'team', price: '£9/Mo Per member', type: 'premium', bens:['base data','more data', 'offline mode', 'publish your work', 'export your work', ]  },
    { name: 'Founder', id: 'founder', price: '£120/Year', type: 'premium', bens:['base data','even more data', 'offline mode','publish your work', 'export your work', 'Founders NFT', 'New features first' ]  },
  ]


 export const PRICE_IDS: Record<string, string> = {
  pro: process.env.STRIPE_PRICE_PRO!,
  team: process.env.STRIPE_PRICE_TEAM!,
  founder: process.env.STRIPE_PRICE_FOUNDER!,
}

export const QUOTES = [
  { text: "We learn from history that we do not learn from history", source: "Georg Wilhelm Friedrich Hegel" },
  { text: "History is a conscious, self-mediating process — Spirit emptied out into Time", source: "Georg Wilhelm Friedrich Hegel" },
  { text: "Study the past if you would define the future", source: "Georg Wilhelm Friedrich Hegel" },
  { text: "History is philosophy teaching by examples", source: "Dionysius of Halicarnassus" },
  { text: "There are two kinds of history: official history, which is the lie everyone agrees to, and secret history, in which we discover the true causes of events", source: "Honoré de Balzac" },
  { text: "The good historian resembles the ogre of the fairy tale. Wherever he smells human flesh, he knows that there lies his quarry", source: "Marc Bloch" },
  { text: "Life can only be understood backwards; but it must be lived forwards", source: "Søren Kierkegaard"  },
  { text: "We need history, certainly, but we need it for the sake of life and action", source: "Friedrich Nietzsche"},
  { text: "The separation of the observer from the phenomenon to be observed is no longer possible", source: "Werner Heisenberg" },
  { text: "The distinction between past, present, and future is only a stubbornly persistent illusion", source: "Einstein" },
  { text: "Duration is the continuous progress of the past which gnaws into the future and which swells as it advances", source: "Henri Bergson" },
  { text: "The universe is a machine for the making of god.", source: "Henri Bergson" },
  { text: "In each case, infinitesimal traces permit the comprehension of a deeper, otherwise unattainable reality", source: "Carlo Ginzburg" },
  { text: "Time goes from present to past", source: "Dōgen" },
  { text: "What's done cannot be undone", source: "William Shakespeare" },
  { text: "Time forks perpetually toward innumerable futures", source: "Jorge Luis Borges" },
  { text: "There are no facts without interpretation", source: "Hayden White" },
  { text: "Who controls the past controls the future: who controls the present controls the past", source: "George Orwell" },
  { text: "The very ink with which history is written is merely fluid prejudice", source: "Mark Twain" },
  { text: "History is more or less bunk", source: "Henry Ford" },
  { text: "It is a strange thing, the way things happen", source: "Flann O’Brien" },
  { text: "One can only be interested in what one believes to be true", source: "Denis Diderot" },
]



