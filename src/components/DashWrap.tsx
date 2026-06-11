// 📄 src/components/DashboardClientWrapper.tsx
'use client';

import { useAppStore } from "@/providers/AppStoreProvider";
import { SiteNav } from '@/components/SiteNav';
import { SandboxWorkspace } from '@/components/SandboxWorkspace';

export default function DashWrap({ children }: { children: React.ReactNode }) {
  const authStatus = useAppStore((state) => state.authStatus);

  // Still handling client states gracefully
  if (authStatus === 'unknown' || authStatus === 'loading') {
    return <div className="p-10 text-center">Initializing workspace...</div>;
  }

  return (
    <>
      <SiteNav />
      <div style={{ maxWidth: '600px', margin: 'auto', padding: '20px' }}>
        
        {/* 🟢 The Server Component compiles into HTML and drops right here */}
        <div className="my-4">
          {children}
        </div>

        {/* The rest of your offline-first playground */}
        <SandboxWorkspace />
        
      </div>
    </>
  );
}