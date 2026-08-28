// 📄 src/app/dashboard/page.tsx
import DashWrap from '@/components/dash/DashWrap';
import { AvatarUpload } from '@/components/dash/AvatarUpload';
import AccountDetailsCard from '@/components/dash/AccountDetailsCard';
import { SandboxWorkspace } from "@/components/dash/SandboxWorkspace" // Adjust path as needed
import { ContactUsCard } from "@/components/dash/ContactUsCard";
import styles from '@/app/styles/dashboard.module.css' 


export default async function DashboardPage() {
//  const supabase = await createClient();
//  const { data: { user } } = await supabase.auth.getUser();

  // Hard block at the server level: unauthenticated traffic never sees the shell
 // if (!user) {
  //  redirect('/login');
 // }

  return (
    /* We nest the Server Component inside the Client Component */
    <DashWrap>
      <div className={styles.gridCard}>
        <div className={styles.cardHeader}>
      <h1 className={styles.AccountCardHeader}>Account Details</h1>
      </div>
      <div className={styles.cardBody}>
      <AccountDetailsCard />
      </div>
      </div>
   
   
   <div className={styles.gridCard}>
    <div className={styles.cardHeader}>
      <h1 className={styles.AccountCardHeader}>Upload your Avatar</h1>
      </div>
      <div className={styles.cardBody}>

          <AvatarUpload />
          </div>
    </div>

    <div className={styles.gridCard}>
      <div className={styles.cardHeader}>
      <h1 className={styles.AccountCardHeader}>Sandbox</h1>
      </div>
      <div className={styles.cardBody}>
         <SandboxWorkspace />
         </div>
    </div>
            
        <div className={styles.gridCard}>
          <div className={styles.cardHeader}>
          <h1 className={styles.AccountCardHeader}>Other Card</h1>
          </div>
          <div className={styles.cardBody}>
            HELLO
          </div>
        </div>

        <div className={styles.gridCard}>
          <div className={styles.cardHeader}>
            <h1 className={styles.AccountCardHeader}>Contact us</h1>
          </div>
          <div className={styles.cardBody}>
            <ContactUsCard />
          </div>
          
        </div>
    </DashWrap>
  );
}