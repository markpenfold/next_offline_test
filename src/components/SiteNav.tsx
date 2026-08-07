'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAppStore } from "@/providers/AppStoreProvider";
import { usePathname } from 'next/navigation'
import { LogoutButton } from "@/components/LogoutButton";
import classes from '@/app/styles/sitenav.module.css'
import { Circle, EllipsisVertical } from 'lucide-react';
import { AVATAR_BUCKET_URL } from '@/lib/utils/constants';
import styles from '@/app/styles/text.module.css'

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

// =========================================================
// 2. PUBLIC GUEST NAVBAR (No Store, Lightning Fast)
// =========================================================
function PublicSiteNav() {
  return (
    <nav className={classes.navcontainer}>
      <div className={classes.linksGroup}>
        <Link href="/" className={classes.brandLink}><Circle /></Link>
        <Link href="/login" className={classes.brandLink}>Login</Link>
        <Link href="/pricing" className={classes.brandLink}>Sign Up</Link>
      </div>
    </nav>
  );
}

// =========================================================
// 3. AUTHENTICATED APP NAVBAR (Safe to use all hooks here)
// =========================================================
function AuthenticatedSiteNav() {
  const pathname = usePathname()
  const isOnline = useAppStore((s) => s.isOnline);
  const tier = useAppStore((s) => s.tier);
  const profile = useAppStore((s) => s.profile);
  const uID = useAppStore((s) => s.userId);
  const authStatus = useAppStore((s) => s.authStatus);
  const avatarVersion = useAppStore((s) => s.avatarVersion || '')
  // State to track if the current avatar URL fails to load
  const [imageError, setImageError] = useState(false)
  const avatarUrl = uID ? `${AVATAR_BUCKET_URL}/${uID}/avatar.png?v=${avatarVersion}` : null
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const welcomeName = profile?.name || profile?.username || 'explorer'

// ROUTE-BASED HEADER TITLE & SUBTITLE SWITCH
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
      default:
        return null
    }
  }

  const header = getHeaderInfo()






  //console.log("HAS AVATAR in sitenav?", profile?.has_avatar)
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

  // Reset the error state if the user uploads a new image or switches accounts
  useEffect(() => {
    setImageError(false)
  }, [uID, avatarVersion])

  // Even if authenticated, handle states where profile data hasn't fully hydrated yet
  if (authStatus !== 'authenticated' || !profile) {
    return <PublicSiteNav />;
  }

  return (
    <nav className={classes.navcontainer}>
      <div className={classes.linksGroup}>
        <Link href="/" className={classes.brandLink}><Circle size={32} strokeWidth={3} /></Link>
        
        {/* 🎯 HEADER TITLE BADGE DISPLAY */}
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
           
          
        </div>

        <button 
          className={classes.menuToggleButton} 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <EllipsisVertical />
        </button>
          
            <Link 
              href="/dash" 
              
            >
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
  );
}