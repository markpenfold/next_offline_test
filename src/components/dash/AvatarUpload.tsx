'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useAppStore } from "@/providers/AppStoreProvider"
import { avatarSchema } from "@/lib/validations/primitives"
import styles from '@/app/styles/dashboard.module.css'
import { AVATAR_BUCKET_URL } from '@/lib/utils/constants'
import { Upload } from 'lucide-react'

export function AvatarUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  
  const [loadError, setLoadError] = useState(false)

  const userId = useAppStore((s) => s.userId) ?? ''
  const avatarVersion = useAppStore((s) => s.avatarVersion || '')
  const setAvatarVersion = useAppStore((s) => s.setAvatarVersion)
  const profile = useAppStore((s) => s.profile)
  const syncFromDatabase = useAppStore((s) => s.syncFromDatabase)

  const supabase = createClient()
  const baseUrl = `${AVATAR_BUCKET_URL}/${userId}/avatar.png`
  
  const localPreview = selectedFile ? URL.createObjectURL(selectedFile) : null
  const previewUrl = avatarVersion ? `${baseUrl}?v=${avatarVersion}` : baseUrl

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
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ has_avatar: false })
        .eq('id', userId)

      if (dbError) throw dbError

      const filePath = `${userId}/avatar.png`
      await supabase.storage.from('avatars').remove([filePath])

      syncFromDatabase()
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
    setLoadError(false)
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
      setAvatarVersion(Date.now().toString())
      setSelectedFile(null)
    }
  }

  return (
    <div className={styles.gridCard}>
      <div className={styles.cardHeader}>
        <div className={styles.headerTitleGroup}>
        <Upload size={21} strokeWidth={1.8} className={styles.headerIcon} />
        <h1 className={styles.AccountCardHeader}>Upload your Avatar</h1>
        </div>
      </div>
      
      <div className={styles.cardBody} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
      </div>

      {/* Centered Actions in Footer Band */}
      {(selectedFile || (profile?.has_avatar && !selectedFile)) && (
        <div className={styles.cardFooter}>
          <div className={styles.globalSaveRow} style={{ justifyContent: 'center' }}>
            {selectedFile && (
              <button 
                onClick={startUpload} 
                disabled={uploading}
                className="fullButtonGreen btn"
              >
                {uploading ? 'SAVING TO OMENLAND...' : 'CONFIRM & SAVE'}
              </button>
            )}

            {profile?.has_avatar && !selectedFile && (
              <button 
                onClick={handleDelete} 
                disabled={uploading}
                className="fullButtonGreen btn"
              >
                {uploading ? 'DELETING...' : 'REMOVE AVATAR'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}