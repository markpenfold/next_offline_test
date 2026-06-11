'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AppStoreContext } from "@/providers/AppStoreProvider"; // 🆕 Make sure to export the raw Context from your provider file!
import { useAppStore } from "@/providers/AppStoreProvider";
import { LogoutButton } from "@/components/LogoutButton";
import classes from '@/app/styles/sitenav.module.css'
import { Circle } from 'lucide-react';
import { AVATAR_BUCKET_URL } from '@/lib/utils/constants';

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
  const isOnline = useAppStore((s) => s.isOnline);
  const tier = useAppStore((s) => s.tier);
  const profile = useAppStore((s) => s.profile);
  const uID = useAppStore((s) => s.userId);
  const authStatus = useAppStore((s) => s.authStatus);
  const avatarVersion = useAppStore((s) => s.avatarVersion || '')
  // State to track if the current avatar URL fails to load
  const [imageError, setImageError] = useState(false)
  const avatarUrl = uID ? `${AVATAR_BUCKET_URL}/${uID}/avatar.png?v=${avatarVersion}` : null

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
        <Link href="/dash" className={classes.link}>Dashboard</Link>
        <Link href="/pricing" className={classes.link}>Pricing</Link>
      </div>

      <div className={classes.userSection}>
        {!isOnline && <span className={classes.offlineBadge}>Offline Mode</span>}
        
        <div className={classes.profileMeta}>
          <span className={classes.userName}>{profile.username}</span>
         
          <span className={classes.usernameSub} style={{ fontSize: '10px', color: 'gold' }}>
            Plan: {tier.toUpperCase()}
          </span>
        </div>
      <div  className={classes.avatarHolder}>
        {/* 🟢 Condition: Try loading the image only if we haven't hit a 404/error yet */}
        {avatarUrl && !imageError ? (
          <img 
            src={avatarUrl} 
            alt="User Avatar" 
            className={classes.avatar}
            crossOrigin="anonymous"
            onError={() => {
              // If the image doesn't exist (404) or they are offline and it's uncached, 
              // this triggers and seamlessly flips the UI to the text fallback.
              setImageError(true)
            }}
          />
        ) : (
          <div className={classes.avatarFallback}>
            {getInitials()}
          </div>
        )}
      </div>

        <LogoutButton />
      </div>
    </nav>
  );
}