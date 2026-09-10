'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from "@/providers/AppStoreProvider"
import { updateProfile } from '@/lib/supabase/client_queries'
import { UserPen } from 'lucide-react';
import styles from '@/app/styles/dashboard.module.css'

export function ProfileManager() {
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

  async function saveProfileData(
    updates: { display_name?: string; bio?: string; follow?: string[] },
    fieldKey: string
  ) {
    setSavingField(fieldKey)
    setStatusMsg(null)

    try {
      const userId = (profile as { id?: string }).id

      if (!userId) {
        throw new Error('User ID is missing from profile.')
      }

      await updateProfile(userId, updates)

      setStatusMsg({ type: 'success', text: 'Profile updated successfully!' })
      router.refresh()
    } catch (error: any) {
      setStatusMsg({
        type: 'error',
        text: error?.message || 'Failed to update profile.',
      })
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

  return (
    <div className={`${styles.gridCard} ${styles.wideCard}`}>
      {/* Matching Card Header */}
      <div className={styles.cardHeader}>
        <div className={styles.headerTitleGroup}>
        <UserPen size={21} strokeWidth={1.8} className={styles.headerIcon} />
        <h1 className={styles.AccountCardHeader}>Profile Settings</h1>
        </div>
      </div>

      <form onSubmit={handleSaveAll} className={styles.cardForm}>
        {/* Main Card Body */}
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
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g., Marko Polo"
                  className={styles.textInput}
                  required
                />
              </div>
              <div className={styles.btnRow}>
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
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Explorer, writer, and edge architecture enthusiast..."
                  className={styles.textareaInput}
                  maxLength={160}
                />
              </div>
              <div className={styles.btnRow}>
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
                  onChange={(e) => setFollowInput(e.target.value)}
                  placeholder="e.g., @alice, @bob, @carol"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.btnRow}>
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

        {/* Matching Card Footer Band */}
        <div className={styles.cardFooter}>
          <div className={styles.globalSaveRow}>
            <div className={styles.commitNote}>
              <strong>Commit all changes</strong>
              <span className={styles.fieldHelpText}>Refresh your browser for changes to take effect</span>
            </div>
            <button
              type="submit"
              disabled={savingField !== null}
              className="fullButtonGreen btn marginRight12"
            >
              {savingField === 'all' ? 'Updating...' : 'SAVE ALL'}
            </button>
          </div>

          {statusMsg && (
            <div className={styles.statusRow}>
              <span
                className={
                  statusMsg.type === 'success'
                    ? styles.successMsg
                    : styles.errorMsg
                }
              >
                {statusMsg.text}
              </span>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}