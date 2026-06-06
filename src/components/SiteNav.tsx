'use client'

import { useContext } from 'react'
import Link from 'next/link'
import { AppStoreContext } from "@/providers/AppStoreProvider"; // 🆕 Make sure to export the raw Context from your provider file!
import { useAppStore } from "@/providers/AppStoreProvider";
import { LogoutButton } from "@/components/LogoutButton";
import classes from '@/app/styles/sitenav.module.css'

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
        <Link href="/" className={classes.brandLink}>⚡ Home</Link>
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

  const getInitials = (name: string | null) => {
    if (!name) return 'OL';
    return name.replace(/[._+]/g, ' ').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const avatarUrl = profile?.hasAvatar 
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${uID}.png`
    : null;

  // Even if authenticated, handle states where profile data hasn't fully hydrated yet
  if (authStatus !== 'authenticated' || !profile) {
    return <PublicSiteNav />;
  }

  return (
    <nav className={classes.navcontainer}>
      <div className={classes.linksGroup}>
        <Link href="/" className={classes.brandLink}>⚡ MainApp</Link>
        <Link href="/dash" className={classes.link}>Dashboard</Link>
      </div>

      <div className={classes.userSection}>
        {!isOnline && <span className={classes.offlineBadge}>Offline Mode</span>}
        
        <div className={classes.profileMeta}>
          <span className={classes.userName}>{profile.username}</span>
         
          <span className={classes.usernameSub} style={{ fontSize: '10px', color: 'gold' }}>
            Plan: {tier.toUpperCase()}
          </span>
        </div>

        {avatarUrl ? (
          <img 
            src={avatarUrl} 
            alt="Avatar" 
            className={classes.avatar}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className={classes.avatarFallback}>{getInitials(profile.name)}</div>
        )}

        <LogoutButton />
      </div>
    </nav>
  );
}