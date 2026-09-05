'use client';

import Link from 'next/link';
import { 
  BookCheck, 
  MountainSnow, 
  LocateFixed, 
  ChartNoAxesGantt, 
  Share2, 
  Megaphone 
} from 'lucide-react';
import { useAppStore } from "@/providers/AppStoreProvider";
import classes from '@/app/styles/home.module.css';

export function HowItWorks() {
  const profile = useAppStore((s) => s.profile);
  
  // Dynamic target destination based on auth state
  const targetUrl = profile ? '/omenland' : '/pricing';

  return (
    <div className={classes.section}>
      <div className={classes.subTitle}>How it works</div>

      <div className={classes.sub_subTitle}>
        <Link href={targetUrl} className='brandLink'>
          {profile ? 'Go to your Omenland' : 'Create a free account to get started'}
        </Link>
      </div>

      <div className={classes.oneTwoThree}>
        {/* Card 1 */}
        <div className={classes.iconbox}>
          <Link href={targetUrl} className={classes.iconLink}>
            <BookCheck className={classes.icon} size={92} strokeWidth={1} />
          </Link>
          <div className={classes.iconHeader}>Collect histories</div>
          <div>
            Choose the histories that interest you. Discoveries, inventions, politics, wars, medicine, food... all just a click away.
          </div>
        </div>

        {/* Card 2 */}
        <div className={classes.iconbox}>
          <Link href={targetUrl} className={classes.iconLink}>
            <MountainSnow className={classes.icon} size={92} strokeWidth={1} />
          </Link>
          <div className={classes.iconHeader}>Convert to terrain</div>
          <div>
            As you add a new history, the events are used to generate a terrain. This land, terra incognita, is ready for you to explore.
          </div>
        </div>

        {/* Card 3 */}
        <div className={classes.iconbox}>
          <Link href={targetUrl} className={classes.iconLink}>
            <LocateFixed className={classes.icon} size={92} strokeWidth={1} />
          </Link>
          <div className={classes.iconHeader}>Find interesting events</div>
          <div>
            Explore the terrain you have created, pulling out events that catch your eye.
          </div>
        </div>

        {/* Card 4 */}
        <div className={classes.iconbox}>
          <Link href={targetUrl} className={classes.iconLink}>
            <ChartNoAxesGantt className={classes.icon} size={92} strokeWidth={1} />
          </Link>
          <div className={classes.iconHeader}>Generate a timeline</div>
          <div>
            As you explore the past, events pop out to you. Add these to a timeline.
          </div>
        </div>

        {/* Card 5 */}
        <div className={classes.iconbox}>
          <Link href={targetUrl} className={classes.iconLink}>
            <Share2 className={classes.icon} size={92} strokeWidth={1} />
          </Link>
          <div className={classes.iconHeader}>Graph the connections</div>
          <div>
            Build theories about connections between the events on your timeline. You've just made history.
          </div>
        </div>

        {/* Card 6 */}
        <div className={classes.iconbox}>
          <Link href={targetUrl} className={classes.iconLink}>
            <Megaphone className={classes.icon} size={92} strokeWidth={1} />
          </Link>
          <div className={classes.iconHeader}>Share your discoveries</div>
          <div>
            The fun begins. Share and discuss your theories with others.
          </div>
        </div>
      </div>
    </div>
  );
}