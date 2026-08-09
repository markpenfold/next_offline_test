'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useAppStore } from "@/providers/AppStoreProvider" // 🟢 Watch/Write to your global store
import { avatarSchema } from "@/lib/validations/primitives"
import styles from '@/app/styles/dashboard.module.css'
import { AVATAR_BUCKET_URL } from '@/lib/utils/constants'

export function AvatarUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  
  // Local state to hide the image element if it completely fails to load from the bucket
  const [loadError, setLoadError] = useState(false)

  // 🟢 Connect to your global store version tracking state and setter action
  const userId = useAppStore((s) => s.userId) ?? ''
  const avatarVersion = useAppStore((s) => s.avatarVersion || '')
  const setAvatarVersion = useAppStore((s) => s.setAvatarVersion)
  const profile = useAppStore((s) => s.profile)
  const syncFromDatabase = useAppStore((s) => s.syncFromDatabase)
  

  const supabase = createClient()
  const baseUrl = `${AVATAR_BUCKET_URL}/${userId}/avatar.png`
  
  // Local object URL if they picked a file but haven't saved it to Supabase yet
  const localPreview = selectedFile ? URL.createObjectURL(selectedFile) : null
  
  // Compute URL: Appends global store version string if it exists to break the browser cache
  const previewUrl = avatarVersion ? `${baseUrl}?v=${avatarVersion}` : baseUrl

  // Calculate initials from username or email as a pure text fallback layout
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

  const handleDelete = async () => {
  const confirmDelete = confirm("Are you sure you want to remove your avatar?")
  if (!confirmDelete) return

  setUploading(true)
  setErrorMsg(null)

  try {
    // 1. Tell the database the user explicitly has NO avatar
    const { error: dbError } = await supabase
      .from('profiles')
      .update({ has_avatar: false })
      .eq('id', userId)

    if (dbError) throw dbError

    // 2. Clean up the physical file from the storage bucket
    const filePath = `${userId}/avatar.png`
    await supabase.storage.from('avatars').remove([filePath])

    // 3. Sync the update directly to your global Zustand store.
    // This stops the old localStorage state from overwriting it on a reload!
    syncFromDatabase();

    // 4. Force our local workspace preview to drop back to initials
    setLoadError(true)

  } catch (error) {
    console.error(error)
    setErrorMsg("Could not delete avatar. Please try again.")
  } finally {
    setUploading(false)
  }
}

  const handleFileSelect = (file: File | undefined) => {
    setErrorMsg(null)
    setLoadError(false) // Reset image visibility error state when choosing a new file
    if (!file) return

    const result = avatarSchema.safeParse({ image: file })

    if (!result.success) {
      setErrorMsg(result.error.issues[0].message)
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
  }

  const startUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setErrorMsg(null)

    const filePath = `${userId}/avatar.png`
    
    const { error } = await supabase.storage
      .from('avatars')
      .upload(filePath, selectedFile, {
        cacheControl: '0',
        upsert: true
      })

    setUploading(false)

    if (error) {
      setErrorMsg("Upload failed. Please try again.")
    } else {
      // 🟢 Update the global store timestamp. 
      // This immediately propagates down to your SiteNav component!
      setAvatarVersion(Date.now().toString())
      setSelectedFile(null)
    }
  }

  return (
   <div className={styles.gridCard}>

    <h1 className={styles.AccountCardHeader}>Upload your Avatar</h1>

 
  <label 
    className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
    onDragLeave={() => setIsDragging(false)}
    onDrop={(e) => {
      e.preventDefault()
      setIsDragging(false)
      handleFileSelect(e.dataTransfer.files?.[0])
    }}
  >
    <input 
      type="file" 
      onChange={(e) => handleFileSelect(e.target.files?.[0])} 
      accept="image/*"
      className={styles.hiddenInput}
    />
    
    <div className={styles.circleWrapper}>
      {/* 🟢 Look directly at the store profile state flag to choose what to render */}
      {(localPreview || (profile?.has_avatar && !loadError)) ? (
        <img 
          src={localPreview || previewUrl} 
          className={styles.avatarImg}
          alt="Avatar Workspace Preview"
          crossOrigin="anonymous"
          onError={() => {
            if (!localPreview) {
              setLoadError(true)
            }
          }}
        />
      ) : (
        <div className={styles.avatarFallbackText}>
          {getInitials()}
        </div>
      )}

      <div className={styles.overlay}>
        <span>{selectedFile ? 'CHANGE' : 'UPLOAD'}</span>
      </div>
    </div>
  </label>

  {errorMsg && <p className={styles.errorText}>⚡ {errorMsg}</p>}

  {/* Confirm & Save Button */}
  {selectedFile && (
    <button 
      onClick={startUpload} 
      disabled={uploading}
      className={styles.actionButton}
    >
      {uploading ? 'SAVING TO OMENLAND...' : 'CONFIRM & SAVE'}
    </button>
  )}

  {/* 🟢 Delete Button: Shows up if they have an active database avatar flag and haven't staged a new local file change */}
  {profile?.has_avatar && !selectedFile && (
    <button 
      onClick={handleDelete} 
      disabled={uploading}
      className={styles.deleteButton}
      style={{
        marginTop: '12px',
        backgroundColor: 'transparent',
        color: '#e11d48',
        border: '1px solid #e11d48',
        padding: '8px 16px',
        fontSize: '0.7rem',
        fontWeight: 'bold',
        letterSpacing: '0.2em',
        cursor: 'pointer',
        width: '240px',
        textTransform: 'uppercase'
      }}
    >
      {uploading ? 'DELETING...' : 'DELETE AVATAR'}
    </button>
  )}
</div>
  )
}