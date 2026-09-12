'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from "@/providers/AppStoreProvider"
import { updateProfile } from '@/lib/supabase/client_queries'
import { UserPen, Check, X } from 'lucide-react'
import styles from '@/app/styles/dashboard.module.css'
import { createClient } from '@/lib/supabase/client'

export function ProfileManager() {
  const router = useRouter()
  const profile = useAppStore((s) => s.profile)
  const activeAccount = useAppStore((s) => s.activeAccount)
  const syncFromDatabase = useAppStore((s) => s.syncFromDatabase)

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [followInput, setFollowInput] = useState('')
  const [savingField, setSavingField] = useState<string | null>(null)
  
  // Track field-specific status: { display_name: 'success', bio: 'error', ... }
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, 'success' | 'error' | null>>({})

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || '')
      setBio(profile.bio || '')
      setFollowInput(Array.isArray(profile.follow) ? profile.follow.join(', ') : '')
    }
  }, [profile])

  if (!profile) return null

  async function saveProfileData(
    updates: { display_name?: string; bio?: string; follow?: string[] },
    fieldKey: string
  ) {
    setSavingField(fieldKey)
    // Clear status for this specific field when attempting save
    setFieldStatuses(prev => ({ ...prev, [fieldKey]: null }))

    try {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        throw new Error('Authentication required. Please sign in again.')
      }

      const userId = user.id
      if (!userId) {
        throw new Error('User ID is missing from profile.')
      }

      if (!activeAccount) {
        throw new Error('No active account selected.')
      }

      if (!activeAccount.can_publish) {
        throw new Error('You do not have permission to modify settings for this account.')
      }

      await updateProfile(userId, activeAccount, updates)
      await syncFromDatabase()

      // Mark success for the field (or all fields if "SAVE ALL" was clicked)
      if (fieldKey === 'all') {
        setFieldStatuses({
          display_name: 'success',
          bio: 'success',
          follow: 'success',
          all: 'success',
        })
      } else {
        setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'success' }))
      }

      router.refresh()
    } catch (error: any) {
      if (fieldKey === 'all') {
        setFieldStatuses({
          display_name: 'error',
          bio: 'error',
          follow: 'error',
          all: 'error',
        })
      } else {
        setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'error' }))
      }
    } finally {
      setSavingField(null)
    }
  }

  const getParsedFollow = () =>
    followInput
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

  const handleSaveDisplayName = (e: React.MouseEvent) => {
    e.preventDefault()
    saveProfileData({ display_name: displayName }, 'display_name')
  }

  const handleSaveBio = (e: React.MouseEvent) => {
    e.preventDefault()
    saveProfileData({ bio: bio }, 'bio')
  }

  const handleSaveFollow = (e: React.MouseEvent) => {
    e.preventDefault()
    saveProfileData({ follow: getParsedFollow() }, 'follow')
  }

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault()
    saveProfileData(
      {
        display_name: displayName,
        bio: bio,
        follow: getParsedFollow(),
      },
      'all'
    )
  }

  const renderStatusIcon = (fieldKey: string) => {
    const status = fieldStatuses[fieldKey]
    if (status === 'success') {
      return <Check size={20} className="text-emerald-500 stroke-[2.5]" style={{ color: '#10b981' }} />
    }
    if (status === 'error') {
      return <X size={20} className="text-rose-500 stroke-[2.5]" style={{ color: '#f43f5e' }} />
    }
    return null
  }

  return (
    <div className={`${styles.gridCard} ${styles.wideCard}`}>
      <div className={styles.cardHeader}>
        <div className={styles.headerTitleGroup}>
          <UserPen size={21} strokeWidth={1.8} className={styles.headerIcon} />
          <h1 className={styles.AccountCardHeader}>Profile Settings</h1>
        </div>
      </div>

      <form onSubmit={handleSaveAll} className={styles.cardForm}>
        <div className={styles.cardBody}>
          <div className={styles.profileFieldsGroup}>
            
            {/* Display Name */}
            <div className={styles.fieldBlock}>
              <div className={styles.inputLine}>
                <div className={styles.labelCol}>
                  <label className={styles.fieldLabel}>Display Name</label>
                </div>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value)
                    setFieldStatuses(prev => ({ ...prev, display_name: null }))
                  }}
                  placeholder="e.g., Marko Polo"
                  className={styles.textInput}
                  required
                />
              </div>
              <div className={styles.btnRow} style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                {renderStatusIcon('display_name')}
                <button
                  type="button"
                  onClick={handleSaveDisplayName}
                  disabled={savingField !== null}
                  className="fullButtonGreen btn"
                >
                  {savingField === 'display_name' ? 'Saving...' : 'Save Name'}
                </button>
              </div>
            </div>

            {/* Short Bio */}
            <div className={styles.fieldBlock}>
              <div className={styles.inputLine}>
                <div className={styles.labelCol}>
                  <label className={styles.fieldLabel}>Short Bio</label>
                  <span className={styles.charCounter}>
                    {bio.length}/160 characters
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value)
                    setFieldStatuses(prev => ({ ...prev, bio: null }))
                  }}
                  placeholder="Explorer, writer, and edge architecture enthusiast..."
                  className={styles.textareaInput}
                  maxLength={160}
                />
              </div>
              <div className={styles.btnRow} style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                {renderStatusIcon('bio')}
                <button
                  type="button"
                  onClick={handleSaveBio}
                  disabled={savingField !== null}
                  className="fullButtonGreen btn"
                >
                  {savingField === 'bio' ? 'Saving...' : 'Save Bio'}
                </button>
              </div>
            </div>

            {/* Follow List */}
            <div className={styles.fieldBlock}>
              <div className={styles.inputLine}>
                <div className={styles.labelCol}>
                  <label className={styles.fieldLabel}>Follow List</label>
                  <span className={styles.fieldHelpText}>
                    Comma separated handles
                  </span>
                </div>
                <input
                  type="text"
                  value={followInput}
                  onChange={(e) => {
                    setFollowInput(e.target.value)
                    setFieldStatuses(prev => ({ ...prev, follow: null }))
                  }}
                  placeholder="e.g., @alice, @bob, @carol"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.btnRow} style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                {renderStatusIcon('follow')}
                <button
                  type="button"
                  onClick={handleSaveFollow}
                  disabled={savingField !== null}
                  className="fullButtonGreen btn"
                >
                  {savingField === 'follow' ? 'Saving...' : 'Save Follows'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card Footer Band */}
        <div className={styles.cardFooter}>
          <div className={styles.globalSaveRow}>
            <div className={styles.commitNote}>
              <strong>Commit all changes</strong>
              <span className={styles.fieldHelpText}>Refresh your browser for changes to take effect</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {renderStatusIcon('all')}
              <button
                type="submit"
                disabled={savingField !== null}
                className="fullButtonGreen btn marginRight12"
              >
                {savingField === 'all' ? 'Updating...' : 'SAVE ALL'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}