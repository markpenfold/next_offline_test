
import styles from "@/app/styles/styles.module.css"
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ForgottenPasswordForm } from '@/components/identity/ForgottenPasswordForm'


export default async function ForgotPasswordPage() {
  const cookieStore = await cookies()
  const supabase = await createClient()
  
  // Always use getUser() not getSession() — getUser() validates with Supabase server
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dash')
  
  return(
  <div className={styles.container}>
       
        <ForgottenPasswordForm />
      </div>
  )
}