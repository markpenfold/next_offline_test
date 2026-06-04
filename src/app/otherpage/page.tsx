// 📄 src/app/dashboard/page.tsx
'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const supabase = createClient();


export default function OtherPage() {
  return (
    <div>
        <Link href="/dash" >⚡ dash</Link>
      <div>WHAT UP!</div>
</div>
  );
}