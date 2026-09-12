'use client'

import { useAppStore } from "@/providers/AppStoreProvider"
import { SiteNav } from "@/components/identity/SiteNav"
import styles from '@/app/styles/dashboard.module.css' 
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useConnectivityStore } from "@/stores/useConnectivityStore"
import {Footer} from '@/components/omenland/Footer';

export default function DashWrap({ children }: { children: React.ReactNode }) {
  const authStatus = useAppStore((state) => state.authStatus)
  const router = useRouter()
  const pathname = usePathname()

  const isOnline = useConnectivityStore(
    (state) => state.network === 'online'
  )

  const isLoading = authStatus === 'unknown' || authStatus === 'loading'
  const isUnauthenticated = authStatus === 'unauthenticated' || (authStatus !== 'authenticated' && !isLoading)

  // Only handle network status toggles (online vs offline dash)
  const shouldRedirectToOfflineDash = !isLoading && !isUnauthenticated && !isOnline && pathname !== '/offlinedash'
  const shouldRedirectToMainDash = !isLoading && !isUnauthenticated && isOnline && pathname === '/offlinedash'

  useEffect(() => {
    // 1. Wait until initial auth check finishes
    if (isLoading) return

    // 2. Redirect unauthenticated users safely inside effect
    if (isUnauthenticated) {
      router.replace('/login')
      return
    }

    // 3. Handle network route switching
    if (shouldRedirectToOfflineDash) {
      router.replace('/offlinedash')
    } else if (shouldRedirectToMainDash) {
      router.replace('/dash')
    }
  }, [isLoading, isUnauthenticated, shouldRedirectToOfflineDash, shouldRedirectToMainDash, router])

  // Prevent UI flash while loading or performing redirects
  if (isLoading || isUnauthenticated || shouldRedirectToOfflineDash || shouldRedirectToMainDash) {
    return <div className={styles.loadingContainer}>Initializing workspace...</div>
  }

  return (
    <>
      <SiteNav />
      <div className="pageContainer">
        <div className={styles.dashboardGrid}>
          {children}
        </div>
        <Footer />
      </div>
    </>
  )
}