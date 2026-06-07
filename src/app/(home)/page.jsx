import { LocateFixed, BookCheck,MountainSnow, Share2, ChartNoAxesGantt, ArrowDownToLine, Megaphone, } from 'lucide-react';
import P5Canvas from "../(home)/home_components/P5Canvas.jsx";
import classes from '@/app/styles/home.module.css'
import { SiteNav } from '@/components/SiteNav'

export default async function HomePage() {

  return (
   
  <div className={classes.pageContainer} >
    <div className={classes.navholder}>
      <SiteNav />
    </div>

    <div className={classes.section}>
        <div className={`${classes.omenland}`}>OMENLAND</div>
    </div>
    
    <div className={classes.section}>
        <P5Canvas />
    </div>
        
    <div  className={classes.spacer}></div>
    <div  className={classes.spacer}></div>

    <div  className={classes.sectionDark}>
      <div  className={classes.spacer}></div>
      <div  className={classes.spacer}></div>
      <div className={classes.oneTwoOne}>
        <div></div>
          <div className={classes.subTitle}>History in the making</div>
        <div></div>
      </div>

      <div className={classes.central}>
       
          <div className={classes.intro}>
            <p>If we wish to live well in the present, and ensure a better future, we must understand our past. </p>
            <p>OMENLAND gives you the tools to go deep into recorded history and wrestle meaning from the chaos.</p>
            <p>This is work for adventurous spirits.</p>
            
          </div>
        <div></div>
      </div>
<div  className={classes.spacer}></div>
<div  className={classes.spacer}></div>
<div  className={classes.spacer}></div>
  </div>

      <div  className={classes.spacer}></div>


 <div  className={classes.section}>
  <div className={classes.subTitle}>How it works</div>
  <div className={classes.oneTwoThree}>
        
        <div className={classes.iconbox} >
          <BookCheck className={classes.icon}   size={92}  strokeWidth={1} />
          <div className={classes.iconHeader} >Collect histories</div>
          <div>Choose the histories that interest you. 
            Discoveries, inventions, politics, wars, medicine, food...
            all just a click away.
            </div>
        </div>

        <div className={classes.iconbox} >
          <MountainSnow className={classes.icon}    size={92}  strokeWidth={1} />
          <div className={classes.iconHeader} >Convert to terrain</div>
          <div>As you add a new history, the events are used to generate a terrain.
            This land, terra incognita, is ready for you to explore.
            </div>
        </div>


        <div className={classes.iconbox}>
          <LocateFixed className={classes.icon} size={92} strokeWidth={1} />
          <div className={classes.iconHeader}>Find interesting events</div>
          <div>
            Explore the terrain you have created, pulling out events that catch your eye.
          </div>
        </div>

        <div className={classes.iconbox} >
          <ChartNoAxesGantt className={classes.icon}   size={92}  strokeWidth={1}  />
          <div className={classes.iconHeader} >Generate a timeline</div>
          <div>
            As you explore the past, events pop out to you. Add these to a timeline.
            </div>
        </div>

        <div className={classes.iconbox} >
          <Share2 className={classes.icon}   size={92}  strokeWidth={1}  />
          <div className={classes.iconHeader} >Graph the connections</div>
          <div>
            Build theories about connections between the events on your timeline.
            You've just made history.
            </div>
        </div>

        <div className={classes.iconbox} >
          <Megaphone className={classes.icon}  size={92}  strokeWidth={1} />
          <div className={classes.iconHeader} >Share your discoveries</div>
          <div>The fun begins. Share and discuss your theories with others. 
            </div>
        </div>
    </div>
</div>
 <div  className={classes.spacer}></div>
  <div  className={classes.spacer}></div>



<div  className={classes.sectionDark}>
        <div  className={classes.spacer}></div>

  <div className={classes.subTitle}>The past is another country</div>
  <div className={classes.intro}>
    <p>History need no longer be a strange land. 
        <span className={classes.fontRed}> Now you can go there.</span> </p>
  </div>
  
        <div  className={classes.spacer}></div>
        <div  className={classes.spacer}></div>

  <div className={classes.filmie}>
    <img src='./terrain.png' />
  </div>
<div  className={classes.spacer}></div><div  className={classes.spacer}></div>
  

<div  className={classes.spacer}></div>
</div>

<div  className={classes.section}>
  <div  className={classes.spacer}></div>
  <div  className={classes.spacer}></div>
  <div  className={classes.spacer}></div>
  <div  className={classes.spacer}></div>
</div>
  
    </div>
  );
}
