import { createClient } from '@/lib/supabase/server'
import styles from '@/app/styles/styles.module.css';
import { redirect } from 'next/navigation'
import OmenWrap from '@/components/data/omenWrap';
import {ShardSelector} from '@/components/data/ShardSelector';
import {IndexLoader} from '@/components/data/IndexLoader';
import { DataView } from '@/components/data/DataView';
import { TerrainShaderTest } from '@/components/terrain/TerrainShaderTest';
import MyCanvas from '@/components/terrain/MyCanvas'
import { TimelineSlider } from '@/components/terrain/Slider';


export default async function OmenPage() {

const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Hard block at the server level: unauthenticated traffic never sees the shell
  if (!user) {
    redirect('/login');
  }

  return (

     <OmenWrap >
      <div className={styles.container_split_1_3}>
        <IndexLoader/>
        <MyCanvas/>
      </div>
      <TimelineSlider />
      <DataView />
    </OmenWrap>
   
    );
}