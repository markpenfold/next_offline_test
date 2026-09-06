export async function isReallyOnline(): Promise<boolean> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return false;
  }

  try {
    const response = await fetch('/api/ping', {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    console.log('📶 Connection confirmed via /ping.');
    return response.ok;
  } catch (e: any) {
    // Catch TimeoutError, AbortError, or thread-starvation TypeError ('Failed to fetch')
    const isTimeoutOrAbort = 
      e.name === 'TimeoutError' || 
      e.name === 'AbortError' || 
      (e instanceof TypeError && e.message.toLowerCase().includes('fetch'));

    if (isTimeoutOrAbort) {
      console.warn('⚠️ Healthcheck timed out due to thread saturation; keeping online state.');
      return typeof window !== 'undefined' ? navigator.onLine : true;
    }

    console.log('🚫 Genuinely offline.');
    return false;
  }
}

export async function isSUPAyOnline(): Promise<boolean> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return false;
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return typeof window !== 'undefined' ? navigator.onLine : true;

    // Ping Supabase base URL without custom headers to avoid CORS preflight delays
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    console.log('📶 Connection confirmed to Supabase.');
    return response.ok || response.status < 500;
  } catch (e: any) {
    const isTimeoutOrAbort = 
      e.name === 'TimeoutError' || 
      e.name === 'AbortError' || 
      (e instanceof TypeError && e.message.toLowerCase().includes('fetch'));

    if (isTimeoutOrAbort) {
      console.warn('⚠️ Supabase ping timed out due to thread saturation; keeping online state.');
      return typeof window !== 'undefined' ? navigator.onLine : true;
    }

    console.log('🚫 Unable to reach Supabase backend.');
    return false;
  }
}