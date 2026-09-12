'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from "@/providers/AppStoreProvider"
import { BriefcaseBusiness } from 'lucide-react';
import Link from 'next/link'
import styles from '@/app/styles/dashboard.module.css'

export function RecentWork() {
  const router = useRouter()
  const profile = useAppStore((s) => s.profile)
  const activeAccount = useAppStore((s) => s.activeAccount)

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [followInput, setFollowInput] = useState('')
  const [savingField, setSavingField] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || '')
      setBio(profile.bio || '')
      setFollowInput(Array.isArray(profile.follow) ? profile.follow.join(', ') : '')
    }
  }, [profile])

  if (!profile) return null

  async function saveProfileData(){}
    
  return (
 <>
    {/* Matching Card Header */}
    <div className={styles.cardHeader}>
      <div className={styles.headerTitleGroup}>
        <BriefcaseBusiness size={21} strokeWidth={1.8} className={styles.headerIcon} />
        <h1 className={styles.AccountCardHeader}>Your work</h1>
      </div>
    </div>
    
    <div className={styles.cardBody}>
      <div className={styles.blogLinkRow}>
        <span className={styles.blogLinkText}>
          Your blog space is live at: <strong>{activeAccount?.name}.omen.land</strong>
        </span>
        
        <Link 
          href={`https://${activeAccount?.name}.omen.land`} 
          target="_blank" 
          rel="noopener noreferrer"
        >
          <button type="button" className="hollowButtonGreen btn">Let's go!</button>
        </Link>
      </div>
      <span className={styles.blogLinkText}>
      <Link  href='dash/editor' > LET'S WRITE!</Link>
      </span>
      <div>YO</div>
      <div>YO</div>
    </div>
    <div className={styles.cardFooter}></div>
</>
    )
}