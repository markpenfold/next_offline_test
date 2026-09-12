// 📄 src/app/dashboard/page.tsx
import DashWrap from '@/components/dash/DashWrap';
import { AvatarUpload } from '@/components/dash/AvatarUpload';
import AccountDetailsCard from '@/components/dash/AccountDetailsCard';
import { ContactUsCard } from "@/components/dash/ContactUsCard";
import { ProfileManager } from '@/components/dash/ProfileManager';
import {MessagesFrom} from  '@/components/dash/MessagesFrom';
import styles from '@/app/styles/dashboard.module.css' 
import { RecentWork } from '@/components/dash/RecentWork';
import { SandboxWorkspace } from '@/components/dash/SandboxWorkspace';


export default async function DashboardPage() {

  return (
    
    <DashWrap>
     {/* ROW 1: Two 2-column cards (2 + 2 = 4) */} 
      <div className={styles.dashboardRow}>
        <div className={`${styles.gridCard} ${styles.span2}`}>
                <RecentWork />
        </div>
        <div className={`${styles.gridCard} ${styles.span2}`}>
        <AccountDetailsCard />
        </div>
      </div>

      {/* ROW 2: One 1-column card + One 3-column card (1 + 3 = 4) */}
      <div className={styles.dashboardRow}>
        <div className={`${styles.gridCard} ${styles.span1}`}>
          <AvatarUpload />
        </div>
        <div className={`${styles.gridCard} ${styles.span2}`}>
          <ProfileManager />
        </div>
        <div className={`${styles.gridCard} ${styles.span1}`}>
            <MessagesFrom />
        </div>
      </div>

      {/* ROW 3: One 2-column card + Two 1-column cards (2 + 1 + 1 = 4) */}
      <div className={styles.dashboardRow}>
        <div className={`${styles.gridCard} ${styles.span2}`}>
              <ContactUsCard />
        </div>
        
        <div className={`${styles.gridCard} ${styles.span2}`}>
                <SandboxWorkspace />
        </div>
      </div>
    </DashWrap>
  );
}