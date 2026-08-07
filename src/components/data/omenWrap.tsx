'use client'

import { useAppStore } from "@/providers/AppStoreProvider"
import { SiteNav } from "@/components/SiteNav" // Adjust path as needed
import styles from '@/app/styles/omenland.module.css' 
import text_styles from '@/app/styles/text.module.css' 

export default function OmenWrap({ children }: { children: React.ReactNode }) {
  const authStatus = useAppStore((state) => state.authStatus)
  const profile = useAppStore((s) => s.profile)

  console.log("OMENLAND PROFILE: ", profile)
  if (authStatus === 'unknown' || authStatus === 'loading') {
    return <div className={styles.loadingContainer}>Initializing workspace...</div>
  }

  return (
    <>
      <SiteNav />


        {/* THE RESPONSIVE GRID LAYOUT CONTAINER */}
        <div className={styles.pageContainer}>
          {children}
        </div>
      
    </>
  )
}