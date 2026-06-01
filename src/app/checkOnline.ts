// 📄 src/checkOnline.ts
export async function isReallyOnline(): Promise<boolean> {
  // Quick optimization: If the OS already reports offline, stop immediately
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return false;
  }

  try {
    // 🌐 Ping Google's main domain
    await fetch("https://www.google.com", { 
      method: 'HEAD', 
      mode: 'no-cors', // 💡 CRUCIAL: Tells the browser "Just fire the ping, don't worry about CORS keys"
      cache: 'no-store', 
      signal: AbortSignal.timeout(2500), // Generous 2.5 second timeout
    });
    
    // If the browser successfully talked to Google's servers, we are 100% online
    console.log("📶 Internet connection confirmed via Google.");
    return true;
  } catch (e) {
    // This will ONLY fire if the network is completely broken or timed out
    console.log("🚫 Genuinely offline or request timed out.");
    return false;
  }
}