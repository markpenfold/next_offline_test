'use client'

import { useAppStore } from "@/providers/AppStoreProvider"
import { SiteNav } from "@/components/SiteNav" // Adjust path as needed
import styles from '@/app/styles/dashboard.module.css' 
import classes from '@/app/styles/text.module.css' 

export default function DashWrap({ children }: { children: React.ReactNode }) {
  const authStatus = useAppStore((state) => state.authStatus)
  const profile = useAppStore((s) => s.profile)

  if (authStatus === 'unknown' || authStatus === 'loading') {
    return <div className={styles.loadingContainer}>Initializing workspace...</div>
  }

  return (
    <>
      <SiteNav />

      <div className={styles.pageContainer}>
        {/* <div className={classes.leftPageHeader}>
          <h1 className={classes.bigHeader}>
            Dashboard  
            <span className={classes.redText}> | </span> 
            <span className={classes.lightHeaded}>Welcome home, {profile?.name || profile?.username ||'explorer'}</span>
          </h1>
        </div>*/}

        {/* THE RESPONSIVE GRID LAYOUT CONTAINER */}
        <div className={styles.dashboardGrid}>
          {/* Main children components injected here from your sub-pages */}
          {children}
        </div>
      </div>
    </>
  )
}