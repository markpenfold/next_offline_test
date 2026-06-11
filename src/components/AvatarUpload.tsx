'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useAppStore } from "@/providers/AppStoreProvider" // 🟢 Watch/Write to your global store
import { avatarSchema } from "@/lib/validations/primitives"
import styles from '@/app/styles/styles.module.css'
import { AVATAR_BUCKET_URL } from '@/lib/utils/constants'

export function AvatarUpload({ userId }: { userId: string }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  
  // Local state to hide the image element if it completely fails to load from the bucket
  const [loadError, setLoadError] = useState(false)

  // 🟢 Connect to your global store version tracking state and setter action
  const avatarVersion = useAppStore((s) => s.avatarVersion || '')
  const setAvatarVersion = useAppStore((s) => s.setAvatarVersion)
  const profile = useAppStore((s) => s.profile)

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
    <div className={styles.avatarWorkspace}>
      <div className={styles.uploadBox}>
        <h3>Upload your Avatar</h3>
      </div>
     
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
          {/* 🟢 Render image if there is a file selected OR if the bucket file didn't 404 error out */}
          {(localPreview || !loadError) ? (
            <img 
              src={localPreview || previewUrl} 
              className={styles.avatarImg}
              alt="Avatar Workspace Preview"
              crossOrigin="anonymous"
              onError={() => {
                // If the user has no avatar file in the bucket yet, 
                // flip the local load error flag to switch gracefully to text initials
                if (!localPreview) {
                  setLoadError(true)
                }
              }}
            />
          ) : (
            /* 🟢 Minimalist Text Initials Fallback inside the workspace container */
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

      {selectedFile && (
        <button 
          onClick={startUpload} 
          disabled={uploading}
          className={styles.actionButton}
        >
          {uploading ? 'SAVING TO OMENLAND...' : 'CONFIRM & SAVE'}
        </button>
      )}
    </div>
  )
}