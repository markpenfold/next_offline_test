import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OmenWrap from '@/components/data/omenWrap';
import { OmenMenu } from '@/components/OmenlandMenu';
import MyCanvas from '@/components/terrain/MyCanvas'
import { TimelineSlider } from '@/components/terrain/Slider';
import { IndexLoader } from '@/components/data/IndexLoader';
import { MasterBufferHUD } from "@/components/terrain/terrainHUD";
import styles from "@/app/styles/omenland.module.css";

export default async function OmenPage() {

const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Hard block at the server level: unauthenticated traffic never sees the shell
  if (!user) {
    redirect('/login');
  }

  return (

    <OmenWrap >
      <div  className={styles.quarter_section}><IndexLoader /></div>

       <div className={styles.three_quarter_section}>
        <div style={{ width: '100%', height: '100%' }}><MyCanvas /></div>
          <MasterBufferHUD />
       </div>

       <div className={styles.quarter_section}> </div>
        <div  className={styles.three_quarter_section}><TimelineSlider /></div>
      
      <OmenMenu />
    </OmenWrap>
   
    );
}