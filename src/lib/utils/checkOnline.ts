export async function isReallyOnline(): Promise<boolean> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return false;
  }

  try {
    const response = await fetch("/api/ping", { 
      method: 'HEAD', 
      cache: 'no-store', 
      signal: AbortSignal.timeout(2500),
    });
    
    console.log("📶 Connection confirmed via /ping.");
    return response.ok; // ← actually check the response
  } catch (e) {
    console.log("🚫 Genuinely offline or request timed out.");
    return false;
  }
}



export async function isSUPAyOnline(): Promise<boolean> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return false;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl) return navigator.onLine;

    // Ping Supabase directly. Any HTTP response (even 401/403) means internet + DNS work.
    const response = await fetch(`${supabaseUrl}/rest/v1/`, { 
      method: 'HEAD', 
      headers: { apikey: anonKey || '' },
      cache: 'no-store', 
      signal: AbortSignal.timeout(3000),
    });
    
    console.log("📶 Connection confirmed to Supabase.");
    return response.ok || response.status < 500;
  } catch (e) {
    console.log("🚫 Unable to reach Supabase backend (offline or DNS failed).");
    return false;
  }
}