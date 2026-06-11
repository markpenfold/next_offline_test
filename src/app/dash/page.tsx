// 📄 src/app/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardClientWrapper from '@/components/DashWrap';
import SecureServerData from '@/components/SecureAccountData';
import { YourAccounts } from '@/components/YourAccounts';
import { AvatarUpload } from '@/components/AvatarUpload';


export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Hard block at the server level: unauthenticated traffic never sees the shell
  if (!user) {
    redirect('/offlinedash.');
  }

  return (
    /* We nest the Server Component inside the Client Component */
    <DashboardClientWrapper>
      <YourAccounts />
      <div>
        <AvatarUpload userId={user.id}/>
        </div>
      
    </DashboardClientWrapper>
  );
}