import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/LoginForm'
import Link from 'next/link'
import { redirect } from 'next/navigation'

type LoginProps = {
  searchParams: Promise<{ message?: string }>
}

export default async function LoginPage({ searchParams }: LoginProps) {
  //we can run the online/offline test here as well. 
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 1. If already logged in, send them straight to the main dashboard entrypoint
  if (user) {
    console.log("USER:", user)
    redirect('/dash')
  }

  const { message } = await searchParams

  return (

    <div style={{ maxWidth: '400px', margin: '60px auto', padding: '20px' }}>
      <h1>Log in</h1>
      
      {message && (
        <p style={{ color: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.1)', padding: '10px', borderRadius: '6px' }}>
          {message}
        </p>
      )}

      {/* Client component form logic */}
      <LoginForm />

      <div style={{ marginTop: '15px' }}>
        <Link href='/forgotten-password'>Forgot your password?</Link>
      </div>
    </div>
 
  )
}