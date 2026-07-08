// 📄 src/app/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import DashboardClientWrapper from '@/components/dash/DashWrap';
import { AvatarUpload } from '@/components/dash/AvatarUpload';
import AccountDetailsCard from '@/components/dash/AccountDetailsCard';
import { SandboxWorkspace } from "@/components/dash/SandboxWorkspace" // Adjust path as needed


export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Hard block at the server level: unauthenticated traffic never sees the shell
  if (!user) {
    redirect('/login');
  }

  return (
    /* We nest the Server Component inside the Client Component */
    <DashboardClientWrapper>
      <AccountDetailsCard />
        <AvatarUpload userId={user.id}/>
            <SandboxWorkspace />
    </DashboardClientWrapper>
  );
}