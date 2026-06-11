// 📄 src/app/dashboard/page.tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const supabase = createClient();


export default function OfflineDash() {
  return (
    <div>
        <Link href="/" >⚡ HOME</Link>
      <div>WHAT UP!</div>
</div>
  );
}