// 📄 src/app/actions.ts
'use server'

/**
 * A mock server-side authentication check.
 * Because of 'use server', this code executed strictly on your terminal/server backend.
 */
export async function simulateServerAuth(targetStatus: boolean) {
  // Simulate a tiny 500ms database round-trip delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  console.log(`💻 [Server Action] Executing on server. Returning auth status: ${targetStatus}`);
  
  return targetStatus;
}