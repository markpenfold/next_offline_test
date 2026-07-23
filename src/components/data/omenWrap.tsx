'use client'

import { useAppStore } from "@/providers/AppStoreProvider"
import { SiteNav } from "@/components/SiteNav" // Adjust path as needed
import styles from '@/app/styles/dashboard.module.css' 

export default function OmenWrap({ children }: { children: React.ReactNode }) {
  const authStatus = useAppStore((state) => state.authStatus)
  const profile = useAppStore((s) => s.profile)

  if (authStatus === 'unknown' || authStatus === 'loading') {
    return <div className={styles.loadingContainer}>Initializing workspace...</div>
  }

  return (
    <>
      <SiteNav />

      <div className={styles.pageContainer}>
        <div className={styles.leftPageHeader}>
          <h1 className={styles.bigHeader}>
            OMENLAND  
            <span className={styles.redText}> | </span> 
            <span className={styles.lightHeaded}>Welcome, {profile?.name || 'explorer'}</span>
          </h1>
        </div>

        {/* THE RESPONSIVE GRID LAYOUT CONTAINER */}
        <div className={styles.pageContainer}>
          {/* Main children components injected here from your sub-pages */}
          {children}
        </div>
      </div>
    </>
  )
}