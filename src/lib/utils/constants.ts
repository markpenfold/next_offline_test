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
  { text: "My duty is to report what has been said, but I am by no means bound to believe it all", source: "Herodotus" },
  { text: "What is written without effort is in general read without pleasure.", source: "Dr. Samuel Johnson" },
  { text: "To be ignorant of what occurred before you were born is to remain always a child.", source: "Cicero" },
  { text: "Men are disturb'd not by things, but by the views which they take of things.", source: "Epictetus" },
  { text: "The world is a stage, but the play is badly cast", source: "Oscar Wilde" },
  { text: "The most effective way to destroy people is to deny and obliterate their own understanding of their history", source: "George Orwell" },
  { text: "The conscious and intelligent manipulation of the organized habits and opinions of the masses is an important element in democratic society", source: "Edward Bernays" },
  { text: "What a man wishes to be true, he readily believes. His judgment is guided by his passions, not by reason", source: "Francis Bacon" },
  { text: "History is written by the victors, not because they survived, but because they understood that whoever controls the narrative of yesterday shapes the compliance of tomorrow.", source: "Arthur Koestler" },
  { text: "People do not want the truth. They want security, they want dignity, and above all, they want to feel righteous. History is simply the mirror in which power reflects those desires back to them", source: "Umberto Eco" },
  { text: "Propaganda does not deceive people; it merely helps them to deceive themselves.", source: "Jean-Paul Sartre" },
  { text: "The most effective propaganda is that which flatters the victim’s vanity while stripping him of his judgment", source: "Aldous Huxley" },
]
//  { text: "", source: "" },
 
export const TRIGRAMS = [
  { symbol: "☰", name: "Qián", meaning: "Heaven / Sky", element: "Metal" },
  { symbol: "☱", name: "Duì", meaning: "Lake / Mist", element: "Metal" },
  { symbol: "☲", name: "Lí", meaning: "Fire / Sun", element: "Fire" },
  { symbol: "☳", name: "Zhèn", meaning: "Thunder", element: "Wood" },
  { symbol: "☴", name: "Xùn", meaning: "Wind", element: "Wood" },
  { symbol: "☵", name: "Kǎn", meaning: "Water / Moon", element: "Water" },
  { symbol: "☶", name: "Gèn", meaning: "Mountain", element: "Earth" },
  { symbol: "☷", name: "Kūn", meaning: "Earth / Ground", element: "Earth" },
];

