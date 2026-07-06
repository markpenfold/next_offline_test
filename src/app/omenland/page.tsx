import { createClient } from '@/lib/supabase/server'
import styles from '@/app/styles/styles.module.css';
import { redirect } from 'next/navigation'
import  BasicDuck  from '@/components/data/BasicDuck'
import OmenWrap from '@/components/data/omenWrap';
import {ShardSelector} from '@/components/data/ShardSelector';
import {IndexLoader} from '@/components/data/IndexLoader';


export default async function OmenPage() {

const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Hard block at the server level: unauthenticated traffic never sees the shell
  if (!user) {
    redirect('/login');
  }

  return (
    <OmenWrap >
      <ShardSelector />
      <IndexLoader/>
    </OmenWrap>
    );
}