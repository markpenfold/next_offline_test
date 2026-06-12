import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import styles from '@/app/styles/styles.module.css';
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {SuperSimpleTestHarness} from '@/components/data/SuperSimpleTestHarness'

export default async function OmenPage() {
  const cookieStore = await cookies();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className={styles.pageContainer}>
        <div className={styles.centerPageHeader}>
            <h1 className={styles.bigHeader}>This is the Omen Land</h1>
            <SuperSimpleTestHarness  />
        </div>
    </div>
    );
}