'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useAppStore } from "@/providers/AppStoreProvider"
import { avatarSchema } from "@/lib/validations/primitives"
import styles from '@/app/styles/dashboard.module.css'
import { convertToWebP } from '@/components/blog/blogHelpers' // Adjust import path as needed
import { Upload } from 'lucide-react'

export function AvatarUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const userId = useAppStore((s) => s.userId) ?? ''
  const profile = useAppStore((s) => s.profile)
  const syncFromDatabase = useAppStore((s) => s.syncFromDatabase)

  const CDN_BASE = process.env.NEXT_PUBLIC_R2_CDN_URL || 'https://assets.omen.land'

  const supabase = createClient()
  
  // Notice we use avatar.webp to match our WebP conversion format
  const baseUrl = `${CDN_BASE}/${userId}/avatar.webp`
  const localPreview = selectedFile ? URL.createObjectURL(selectedFile) : null
  const previewUrl = profile?.avatar_url 
  ? `${CDN_BASE}/user-avatars/${userId}/${profile.avatar_url}`
  : null

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
      if (!selectedFile || !userId) return
      setUploading(true)
      setErrorMsg(null)

      try {
        // 1. Convert image to WebP
        const webpFile = await convertToWebP(selectedFile, {
          maxWidth: 500,
          maxSizeBytes: 500 * 1024,
          initialQuality: 0.85,
        })

        // 2. Upload to Cloudflare R2
        const formData = new FormData()
        formData.append('file', webpFile)
        formData.append('userId', userId)

        const r2Res = await fetch('/api/upload-avatar', {
          method: 'POST',
          body: formData,
        })

        if (!r2Res.ok) throw new Error('Failed to upload image to R2.')

        // 3. Build relative path with cache buster
        const cacheBuster = `avatar.webp?v=${Date.now()}`
        // 4. Update Supabase DB
        const { error: dbError } = await supabase
          .from('profiles')
          .update({ 
            has_avatar: true,
            avatar_url: cacheBuster 
          })
          .eq('id', userId)

        if (dbError) throw dbError

        // 5. Reset local state & re-sync store
        setSelectedFile(null)
        await syncFromDatabase()
      } catch (err: any) {
        console.error('Avatar upload process failed:', err)
        setErrorMsg(err.message || 'Upload failed. Please try again.')
      } finally {
        setUploading(false)
      }
    }

  const handleDelete = async () => {
      if (!confirm("Are you sure you want to remove your avatar?")) return

      setUploading(true)
      setErrorMsg(null)

      try {
        // 1. Delete from Cloudflare R2
        await fetch('/api/upload-avatar', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        })

        // 2. Clear fields in Supabase DB
        const { error: dbError } = await supabase
          .from('profiles')
          .update({ 
            has_avatar: false,
            avatar_url: null 
          })
          .eq('id', userId)

        if (dbError) throw dbError

        await syncFromDatabase()
        setLoadError(true)
      } catch (error: any) {
        console.error(error)
        setErrorMsg("Could not delete avatar. Please try again.")
      } finally {
        setUploading(false)
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
                src={localPreview || previewUrl || undefined} 
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