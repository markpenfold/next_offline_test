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
  const [blogTitle, setBlogTitle] = useState('')
  const [blogSubtitle, setBlogSubtitle] = useState('')

  const [savingField, setSavingField] = useState<string | null>(null)
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, 'success' | 'error' | null>>({})

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || profile.full_name || '')
      setBio(profile.bio || '')
      setFollowInput(Array.isArray(profile.follow) ? profile.follow.join(', ') : '')
    }
    if (activeAccount) {
      setBlogTitle(activeAccount.blog_title || activeAccount.name || '')
      setBlogSubtitle(activeAccount.blog_subtitle || '')
    }
  }, [profile, activeAccount])

  if (!profile || !activeAccount) return null

  // Save Account-level settings (blog_title, blog_subtitle)
  async function saveAccountData(updates: { blog_title?: string; blog_subtitle?: string }, fieldKey: string) {
    setSavingField(fieldKey)
    setFieldStatuses(prev => ({ ...prev, [fieldKey]: null }))

    if (!activeAccount) {
        throw new Error('No active account selected.')
      }
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('accounts')
        .update(updates)
        .eq('id', activeAccount.id)

      if (error) throw error

      await syncFromDatabase()
      setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'success' }))
      router.refresh()
    } catch (error) {
      console.error('Failed to update account setting:', error)
      setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'error' }))
    } finally {
      setSavingField(null)
    }
  }

  // Save Profile-level settings (display_name, bio, follow)
  async function saveProfileData(
    updates: { display_name?: string; bio?: string; follow?: string[] },
    fieldKey: string
  ) {
    setSavingField(fieldKey)
    setFieldStatuses(prev => ({ ...prev, [fieldKey]: null }))

    if (!activeAccount) {
        throw new Error('No active account selected.')
      }

    try {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) throw new Error('Authentication required.')
      if (!activeAccount.can_publish) throw new Error('Insufficient permissions.')

      await updateProfile(user.id, activeAccount, updates)
      await syncFromDatabase()

      setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'success' }))
      router.refresh()
    } catch (error: any) {
      console.error('Failed to update profile:', error)
      setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'error' }))
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

  const handleSaveBlogTitle = (e: React.MouseEvent) => {
    e.preventDefault()
    saveAccountData({ blog_title: blogTitle }, 'blog_title')
  }

  const handleSaveBlogSubtitle = (e: React.MouseEvent) => {
    e.preventDefault()
    saveAccountData({ blog_subtitle: blogSubtitle }, 'blog_subtitle')
  }

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingField('all')
    setFieldStatuses({})

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        await updateProfile(user.id, activeAccount, {
          display_name: displayName,
          bio: bio,
          follow: getParsedFollow(),
        })
      }

      await supabase
        .from('accounts')
        .update({
          blog_title: blogTitle,
          blog_subtitle: blogSubtitle,
        })
        .eq('id', activeAccount.id)

      await syncFromDatabase()

      setFieldStatuses({
        display_name: 'success',
        bio: 'success',
        follow: 'success',
        blog_title: 'success',
        blog_subtitle: 'success',
        all: 'success',
      })
      router.refresh()
    } catch (error) {
      console.error('Failed to save all settings:', error)
      setFieldStatuses({ all: 'error' })
    } finally {
      setSavingField(null)
    }
  }

  const renderStatusIcon = (fieldKey: string) => {
    const status = fieldStatuses[fieldKey]
    if (status === 'success') {
      return <Check size={20} className={styles.statusSuccessIcon} />
    }
    if (status === 'error') {
      return <X size={20} className={styles.statusErrorIcon} />
    }
    return null
  }

  return (
    <div className={`${styles.gridCard} ${styles.wideCard}`}>
      <div className={styles.cardHeader}>
        <div className={styles.headerTitleGroup}>
          <UserPen size={21} strokeWidth={1.8} className={styles.headerIcon} />
          <h1 className={styles.AccountCardHeader}>Profile & Blog Settings</h1>
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
              <div className={styles.btnRow}>
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

            {/* Blog Title */}
            <div className={styles.fieldBlock}>
              <div className={styles.inputLine}>
                <div className={styles.labelCol}>
                  <label className={styles.fieldLabel}>Blog Title</label>
                  <span className={styles.fieldHelpText}>
                    Displayed on your site's header
                  </span>
                </div>
                <input
                  type="text"
                  value={blogTitle}
                  onChange={(e) => {
                    setBlogTitle(e.target.value)
                    setFieldStatuses(prev => ({ ...prev, blog_title: null }))
                  }}
                  placeholder="e.g., Marko's Expedition Journal"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.btnRow}>
                {renderStatusIcon('blog_title')}
                <button
                  type="button"
                  onClick={handleSaveBlogTitle}
                  disabled={savingField !== null}
                  className="fullButtonGreen btn"
                >
                  {savingField === 'blog_title' ? 'Saving...' : 'Save Title'}
                </button>
              </div>
            </div>

            {/* Blog Subtitle */}
            <div className={styles.fieldBlock}>
              <div className={styles.inputLine}>
                <div className={styles.labelCol}>
                  <label className={styles.fieldLabel}>Blog Subtitle</label>
                  <span className={styles.fieldHelpText}>
                    Brief summary used for header tagline and RSS feeds
                  </span>
                </div>
                <input
                  type="text"
                  value={blogSubtitle}
                  onChange={(e) => {
                    setBlogSubtitle(e.target.value)
                    setFieldStatuses(prev => ({ ...prev, blog_subtitle: null }))
                  }}
                  placeholder="e.g., Dispatches on web engineering and distributed systems"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.btnRow}>
                {renderStatusIcon('blog_subtitle')}
                <button
                  type="button"
                  onClick={handleSaveBlogSubtitle}
                  disabled={savingField !== null}
                  className="fullButtonGreen btn"
                >
                  {savingField === 'blog_subtitle' ? 'Saving...' : 'Save Subtitle'}
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
              <div className={styles.btnRow}>
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
              <div className={styles.btnRow}>
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
            <div className={styles.footerActionGroup}>
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