'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAppStore } from "@/providers/AppStoreProvider";
import { usePathname } from 'next/navigation'
import { LogoutButton } from "@/components/identity/LogoutButton";
import classes from '@/app/styles/sitenav.module.css'
import { Circle, EllipsisVertical } from 'lucide-react';
import { AVATAR_BUCKET_URL } from '@/lib/utils/constants';
import styles from '@/app/styles/text.module.css'
import { useConnectivityStore } from "@/stores/useConnectivityStore";

// =========================================================
// 1. THE SITESHIFT BOARD (The "Test" component)
// =========================================================
export function SiteNav() {
  // We peek at the raw context directly instead of using the throwing hook
  // const storeContext = useContext(AppStoreContext);
  const authStatus = useAppStore((s) => s.authStatus);

  if (authStatus === 'unknown' || authStatus === 'loading') {
    return null;
  }

  if (authStatus === 'unauthenticated') {
    return <PublicSiteNav />;
  }

  // If it does exist, pass control to the store-aware nav
  return <AuthenticatedSiteNav />;
}

// Neutral placeholder matching your nav dimensions
function SiteNavSkeleton() {
  return (
    <nav className={classes.navcontainer}>
      <div className={classes.linksGroup}>
        <Link href="/" className={classes.brandLink}>
          <Circle size={32} strokeWidth={3} />
        </Link>
      </div>
    </nav>
  );
}


// =========================================================
// 2. PUBLIC GUEST NAVBAR (No Store, Lightning Fast)
// =========================================================
function PublicSiteNav() {
  return (
    <nav className={classes.navcontainer}>
      <div className={classes.linksGroup}>
        <Link href="/" className={classes.brandLink}><Circle size={32} strokeWidth={3} /></Link>
        <Link href="/login" className={classes.brandLink}>Login</Link>
        <Link href="/pricing" className={classes.brandLink}>Signup</Link>
        <Link href="/about" className={classes.brandLink}>About</Link>
      </div>
    </nav>
  );
}

// =========================================================
// 3. AUTHENTICATED APP NAVBAR (Safe to use all hooks here)
// =========================================================
function AuthenticatedSiteNav() {
  const pathname = usePathname()
  const isOnline = useConnectivityStore((state) => state.network === 'online')
  const profile = useAppStore((s) => s.profile)
  const authStatus = useAppStore((s) => s.authStatus)

  const [imageError, setImageError] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Construct URL directly from profile.avatar_url
 const CDN_BASE = process.env.NEXT_PUBLIC_R2_CDN_URL || 'https://assets.omen.land'

const avatarUrl = profile?.avatar_url 
  ? `${CDN_BASE}/user-avatars/${profile.id}/${profile.avatar_url}`
  : null
  // Reset image error synchronously when avatarUrl changes (replaces useEffect)
  const [prevAvatarUrl, setPrevAvatarUrl] = useState(avatarUrl)
  if (avatarUrl !== prevAvatarUrl) {
    setPrevAvatarUrl(avatarUrl)
    setImageError(false)
  }

  const welcomeName = profile?.display_name || profile?.full_name || profile?.username || 'explorer'

  const getHeaderInfo = () => {
    switch (pathname) {
      case '/dash':
        return { title: 'Dashboard', subtitle: `Welcome home, ${welcomeName}` }
      case '/omenland':
        return { title: 'OMENLAND', subtitle: `${welcomeName}` }
      case '/pricing':
        return { title: 'Pricing', subtitle: 'Choose your plan' }
      case '/settings':
        return { title: 'Settings', subtitle: 'Manage account preferences' }
      case '/about':
        return { title: 'About', subtitle: 'Territorial divination' }
      case '/dash/editor':
        return { title: 'Writer', subtitle: 'Feel the draft and do it anyway' }
      default:
        return null
    }
  }

  const header = getHeaderInfo()

  const getInitials = () => {
    const identifier = profile?.username || profile?.email || 'OL'
    return identifier
      .replace(/[._+@]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (authStatus !== 'authenticated' || !profile) {
    return <PublicSiteNav />
  }

  return (
    <nav className={classes.navcontainer}>
      <div className={classes.linksGroup}>
        <Link href="/" className={classes.brandLink}>
          <Circle size={32} strokeWidth={3} />
        </Link>
        
        {header && (
          <div className={styles.leftPageHeader}>
            <h1 className={styles.bigHeader}>
              {header.title}
              <span className={styles.redText}> | </span>
              <span className={styles.lightHeaded}>{header.subtitle}</span>
            </h1>
          </div>
        )}
      </div>

      <div className={classes.userSection}>
        {!isOnline && <span className={classes.offlineBadge}>Offline Mode</span>}
        
        <div className={`${classes.collapsibleMenu} ${isMenuOpen ? classes.open : ''}`}>
          <LogoutButton />
          <Link href="/pricing" className={classes.link}>Pricing</Link>
          <Link href="/dash" className={classes.link}>Dashboard</Link>
          <Link href="/omenland" className={classes.link}>Omenland</Link>
          <Link href="/about" className={classes.link}>About</Link>
        </div>

        <button 
          className={classes.menuToggleButton} 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <EllipsisVertical />
        </button>
          
        <Link href="/dash">
          <div className={classes.avatarHolder}>
            {avatarUrl && !imageError ? (
              <img 
                src={avatarUrl} 
                alt="User Avatar" 
                className={classes.avatar}
                crossOrigin="anonymous"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className={classes.avatarFallback}>
                {getInitials()}
              </div>
            )}
          </div>
        </Link> 
      </div>
    </nav>
  )
}