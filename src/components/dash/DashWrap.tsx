// src/components/dash/DashWrap.tsx
'use client'

import { useAppStore } from "@/providers/AppStoreProvider"
import { SiteNav } from "@/components/identity/SiteNav"
import styles from '@/app/styles/dashboard.module.css' 
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'

export default function DashWrap({ children }: { children: React.ReactNode }) {
  const authStatus = useAppStore((state) => state.authStatus)
  const isOnline = useAppStore((state) => state.isOnline)
  const router = useRouter()
  const pathname = usePathname()

  const isLoading = authStatus === 'unknown' || authStatus === 'loading'

  // Only handle network status toggles (online vs offline dash)
  const shouldRedirectToOfflineDash = !isLoading && !isOnline && pathname !== '/offlinedash'
  const shouldRedirectToMainDash = !isLoading && isOnline && pathname === '/offlinedash'

  useEffect(() => {
    if (isLoading) return

    if (shouldRedirectToOfflineDash) {
      router.replace('/offlinedash')
    } else if (shouldRedirectToMainDash) {
      router.replace('/dash')
    }
  }, [isLoading, shouldRedirectToOfflineDash, shouldRedirectToMainDash, router])

  if (isLoading || shouldRedirectToOfflineDash || shouldRedirectToMainDash) {
    return <div className={styles.loadingContainer}>Initializing workspace...</div>
  }

  return (
    <>
      <SiteNav />
      <div className={styles.pageContainer}>
        <div className={styles.dashboardGrid}>
          {children}
        </div>
      </div>
    </>
  )
}