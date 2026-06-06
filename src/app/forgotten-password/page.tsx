
import styles from "@/app/styles/page.module.css"
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ForgottenPasswordForm } from '@/components/ForgottenPasswordForm'


export default async function ForgotPasswordPage() {
  const cookieStore = await cookies()
  const supabase = await createClient()
  
  // Always use getUser() not getSession() — getUser() validates with Supabase server
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard')
  
  return(
  <div className={styles.container}>
        <h1>Reset Password</h1>
        <ForgottenPasswordForm />
      </div>
  )
}