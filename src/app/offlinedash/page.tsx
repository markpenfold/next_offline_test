// 📄 src/app/dashboard/page.tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import DashWrap from '@/components/dash/DashWrap'

const supabase = createClient();


export default function OfflineDash() {
  return (
    <DashWrap>
      <div>
        <Link href="/">⚡ HOME</Link>
        <div>WHAT UP! Operating in offline mode.</div>
      </div>
    </DashWrap>
  );
}