import { TimelineEvent,} from '@/components/omenland/omenTypes';


// Helper: Safely maps user/bucket tier strings to strictly "pro" or "free"
export function normalizeTier(tierName?: string): "free" | "pro" {
  const lower = tierName?.toLowerCase();
  
  if (lower === "pro" || lower === "founder") {
    return "pro";
  }
  
  return "free"; // Fallback for "free", null, undefined, or unexpected values
}

// lib/detectWebGPU.ts
// lib/detectWebGPU.ts

export interface WebGPUStatus {
  supported: boolean;
  os: 'Linux' | 'Windows' | 'macOS' | 'Android' | 'iOS' | 'Unknown';
  browser: 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'Unknown';
  reason?: string;
}

export async function checkWebGPUSupport(): Promise<WebGPUStatus> {
  if (typeof window === 'undefined') {
    return { supported: false, os: 'Unknown', browser: 'Unknown', reason: 'SSR' };
  }

  // 1. Detect OS
  const ua = navigator.userAgent;
  let os: WebGPUStatus['os'] = 'Unknown';
  if (/Linux/.test(ua) && !/Android/.test(ua)) os = 'Linux';
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';

  // 2. Detect Browser
  let browser: WebGPUStatus['browser'] = 'Unknown';
  if (/Edg/.test(ua)) browser = 'Edge';
  else if (/Chrome/.test(ua)) browser = 'Chrome';
  else if (/Firefox/.test(ua)) browser = 'Firefox';
  else if (/Safari/.test(ua)) browser = 'Safari';

  // 3. Check WebGPU API
  if (!navigator.gpu) {
    return {
      supported: false,
      os,
      browser,
      reason: 'WebGPU is not enabled in this browser.',
    };
  }

  // 4. Test Native GPU Adapter
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return {
        supported: false,
        os,
        browser,
        reason: 'GPU adapter returned null (blocked by driver or OS settings).',
      };
    }
    return { supported: true, os, browser };
  } catch (err: any) {
    return {
      supported: false,
      os,
      browser,
      reason: err?.message || 'Failed to initialize GPU device.',
    };
  }
}



// Helper function to sort timeline events by year
export function sortTimelineEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    const yearA = a?.year ?? 0;
    const yearB = b?.year ?? 0;
    return yearA - yearB;
  });
}