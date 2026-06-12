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
    <div className={styles.formHolder}>
        <div className={styles.p4}>
            <h1>This is the Omen Land</h1>
            <SuperSimpleTestHarness  />
        </div>
    </div>
);
}