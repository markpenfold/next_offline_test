import { LocateFixed, BookCheck,MountainSnow, Share2, ChartNoAxesGantt, ArrowDownToLine, Megaphone, } from 'lucide-react';
import P5Canvas from "../(home)/home_components/P5Canvas.jsx";
import classes from '@/app/styles/home.module.css'
import { SiteNav } from '@/components/identity/SiteNav'
import {Footer} from '@/components/omenland/Footer'
import {QuoteBox} from '@/components/omenland/QuoteBox'
import Link from 'next/link'
import { Egg } from 'lucide-react';
import { HowItWorks } from './home_components/HowItWorks';

export default async function HomePage() {

  return (
   
  <div className="pageContainer" >
    <div className={classes.navholder}>
      <SiteNav />
    </div>

    <div className="section">
        <div className={`${classes.omenland}`}>OMENLAND</div>
    </div>
    
    <div className="section">
        <P5Canvas />
    </div>
        
    
    


<div className="sectionDark">
    <div className={classes.subTitle}>History in the making</div>

  <div className={classes.central}>
    <div className={classes.intro}>
      <p>OMENLAND gives you the tools to go deep into recorded history and wrestle meaning from the chaos</p>
    </div>
    <QuoteBox />
  </div>   
</div>
        
<HowItWorks />

<div className="sectionDark">
  {/* Text floating on top */}
  <div className={classes.textOverlay}>
    <div className={classes.HugeSubTitle}>Here be dragons</div>
  </div>

  {/* Image behind */}
  <div className={classes.filmie}>
    <img src="./terrain.png" alt="Terrain" />
  </div>
</div>


<div className="sectionDark">
    <Footer />
</div>


</div>
  );
}
