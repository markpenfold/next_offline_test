import { createClient } from '@/lib/supabase/server'
import { LoginForm } from '@/components/LoginForm'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import classes from '@/app/styles/styles.module.css'

type LoginProps = {
  searchParams: Promise<{ message?: string, verified?:string }>
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

  const { message, verified } = await searchParams


   return (
  <div style={{ maxWidth: '400px', margin: '60px auto', padding: '20px' }}>
    

    {verified === 'true' ? (
      <div className={classes.warning_banner}>
        <h3>Email confirmed! Please Sign in to continue.</h3>
      </div>
    ) : (
      <h1>Log in</h1>
    )
  
  }

    {message && (
      <div className={classes.warning_banner}>
        <h3>{message}</h3>
      </div>
    )}

      {/* Client component form logic */}
      <LoginForm />

      <div style={{ marginTop: '5px' , paddingLeft: '30px'}}>
        <Link href='/forgotten-password'>Forgot your password?</Link>
      </div>
    </div>
 
  )
}