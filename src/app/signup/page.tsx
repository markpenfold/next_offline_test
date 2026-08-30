
import { createClient } from '@/lib/supabase/server'
import { SignupForm } from '@/components/identity/SignupForm'
import Link from 'next/link'
import classes from '@/app/styles/styles.module.css'
import { SiteNav } from '@/components/identity/SiteNav'

interface SignupPageProps {
  searchParams: Promise<{ plan?: string }>
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const resolvedParams = await searchParams
  const selectedPlan = resolvedParams.plan || 'free' // Fallback to free if empty

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    return (
      
    <>
    <SiteNav/>
      <div className={classes.warning_banner}>
        <h3>You are already logged in. Go to your <Link href='/dash' className={classes.brandLink}> dashboard</Link></h3>
        </div>
        <SignupForm planChoice={selectedPlan}/>
     </>
    );
  }

  return (
    <>
    <SiteNav/> 
    <div className={classes.p4}>
      
        <SignupForm planChoice={selectedPlan}/>
    </div>
    </>
  );
}