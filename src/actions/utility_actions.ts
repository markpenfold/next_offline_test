// 📄 src/app/actions.ts
'use server'

import { createAdminClient } from "@/lib/supabase/admin"

export async function checkAccountNameAvailability(accountName: string) {

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('accounts')
    .select('id')
    .eq('name', accountName) 
    .maybeSingle()

  if (error) {
    console.error('Error checking account name:', error)
    return { available: true }
  }

  return { available: !data }
}

export async function checkBlogNameAvailability(blogTitle: string) {

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('accounts')
    .select('id')
    .eq('account_slug', blogTitle.trim())
    .maybeSingle() 

  if (error) {
    console.error('Error checking blog name:', error)
    return { available: true }
  }
  console.log("blog name ID:", blogTitle, data)

  return { available: !data }
}

export async function checkUserNameAvailability(userName: string) {
  if (!userName || userName.trim() === '') return { available: true }

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', userName.trim()) 
    .maybeSingle()

  if (error) {
    console.error('Error checking blog name:', error)
    return { available: true }
  }

  return { available: !data }
}

/** A mock server-side authentication check. */
export async function simulateServerAuth(targetStatus: boolean) {
  // Simulate a tiny 500ms database round-trip delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  console.log(`💻 [Server Action] Executing on server. Returning auth status: ${targetStatus}`);
  
  return targetStatus;
}


