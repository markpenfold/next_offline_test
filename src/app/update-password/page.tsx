import { UpdatePasswordForm } from '@/components/identity/UpdatePasswordForm'
import styles from '@/app/styles/styles.module.css'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'


export default async function Page() {

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser()
  // 3. Extract the identifier (Email or Display Name)
  // Note: 'full_name' is common if you used Social Auth or set it during sign-up
  const displayName = user?.user_metadata?.full_name || user?.email

  if (!user) {
    redirect('/login');
  }

  return (
    <div className={styles.reset_box}>
      <h1 className={styles.reset_head}>Lost the old password, have we?</h1>
      <p className={styles.context_text}>
        Updating password for: <strong>{user?.email}</strong>
      </p>
      <div>
        <UpdatePasswordForm />
      </div>
      <h3 className={styles.reset_sub}>let's try and keep hold of this one, eh?</h3>
    </div>
  );
}