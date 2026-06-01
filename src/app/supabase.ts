// 📄 src/supabase.ts
import { createClient } from '@supabase/supabase-js'

// Next.js reads from your environment using process.env
// The NEXT_PUBLIC_ prefix exposes these safely to the browser
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)