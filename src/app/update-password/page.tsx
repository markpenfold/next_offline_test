import { UpdatePasswordForm } from '@/components/identity/UpdatePasswordForm';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import styles from '@/app/styles/auth.module.css';

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main className={`pageContainer darkBackground ${styles.resetPageWrapper}`}>
      <div className={styles.reset_box}>
        <h1 className={styles.reset_head}>Lost the old password, have we?</h1>
        <p className={styles.context_text}>
          Updating password for: <strong>{user?.email}</strong>
        </p>
        
        <div className={styles.formWrapper}>
          <UpdatePasswordForm />
        </div>

        <h3 className={styles.reset_sub}>let's try and keep hold of this one, eh?</h3>
      </div>
    </main>
  );
}