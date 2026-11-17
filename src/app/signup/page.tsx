
import { createClient } from '@/lib/supabase/server'
import { InvitedSignupForm } from '@/components/identity/InvitedSignupForm'
import { OrganicSignupForm } from '@/components/identity/OrganicSignupForm'
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
  const invitedUser = false

  /////////////////////////////////////////////
  // received an invite to join a team. Nice //
  /////////////////////////////////////////////
  if (invitedUser) {
    return (
    <>
    <SiteNav/>
      <div className={classes.warning_banner}>
        <h3>You are already logged in. Go to your <Link href='/dash' className={classes.brandLink}> dashboard</Link></h3>
        </div>
        <InvitedSignupForm planChoice={selectedPlan}/>
     </>
    );
  }


  //////////////////////////////////////////
  // You are logged in, what's going on? ///
  //////////////////////////////////////////
  if (user) {
    return (
    <>
    <SiteNav/>
      <div className={classes.warning_banner}>
        <h3>You are already logged in. Go to your <Link href='/dash' className={classes.brandLink}> dashboard</Link></h3>
        </div>
        <OrganicSignupForm planChoice={selectedPlan}/>
     </>
    );
  }

  /////////////////////////////////////////////
  // FRESH MEAT! //////////////////////////////
  /////////////////////////////////////////////
  return (
    <>
    <SiteNav/> 
    <div className={classes.p4}>
      
        <OrganicSignupForm planChoice={selectedPlan}/>
    </div>
    </>
  );
}