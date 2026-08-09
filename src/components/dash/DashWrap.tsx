// 📄 src/components/dash/DashWrap.tsx
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

  // 1. Evaluate redirect flags during the render phase
  const shouldRedirectToLogin = authStatus === 'unauthenticated'
  const shouldRedirectToOfflineDash = authStatus === 'authenticated' && !isOnline && pathname !== '/offlinedash'
  const shouldRedirectToMainDash = authStatus === 'authenticated' && isOnline && pathname === '/offlinedash'

  const isRedirecting = shouldRedirectToLogin || shouldRedirectToOfflineDash || shouldRedirectToMainDash
  const isLoading = authStatus === 'unknown' || authStatus === 'loading'

  // 2. Perform side-effects inside useEffect
  useEffect(() => {
    if (shouldRedirectToLogin) {
      router.replace('/login')
    } else if (shouldRedirectToOfflineDash) {
      router.replace('/offlinedash')
    } else if (shouldRedirectToMainDash) {
      router.replace('/dash')
    }
  }, [shouldRedirectToLogin, shouldRedirectToOfflineDash, shouldRedirectToMainDash, router])

  // 3. 🟢 GUARD: Do not paint children if store is initializing OR if a redirect is pending
  if (isLoading || isRedirecting) {
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