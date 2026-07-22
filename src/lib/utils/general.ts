// Helper: Safely maps user/bucket tier strings to strictly "pro" or "free"
export function normalizeTier(tierName?: string): "free" | "pro" {
  const lower = tierName?.toLowerCase();
  
  if (lower === "pro" || lower === "founder") {
    return "pro";
  }
  
  return "free"; // Fallback for "free", null, undefined, or unexpected values
}
