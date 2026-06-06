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