import { create } from 'zustand'
import { saveDraft, loadDraft, TemplateId } from '@/components/blog/blogHelpers'
import { ManifestEntry, removeLocalPublishedPost, reconcileLocalPublishedWithManifest, syncAndUploadManifest, getOPFSPosts, LocalPostEntry, uploadDraftMediaToR2, moveDraftToPublished, } from "@/components/data/diskOPFS" // import your new scanner utility

interface UserContext {
  userId: string
  accountId: string
  accountSlug?: string
}

interface EditorState {
  // --- STATE PROPERTIES ---
  draftId: string
  title: string
  subTitle: string
  customSlug: string
  isDirty: boolean
  isSaving: boolean
  isPublishing: boolean
  isLoadingDrafts: boolean
  availableDrafts: LocalPostEntry[]
  blobMap: Record<string, string>
  isDrawerOpen: boolean
  templateId: TemplateId

  // --- SYNCHRONOUS ACTIONS ---
  setDraftId: (id: string) => void
  setTitle: (title: string) => void
  setSubTitle: (subTitle: string) => void
  setCustomSlug: (slug: string) => void
  setTemplateId: (id: TemplateId) => void
  registerBlob: (blobUrl: string, fileName: string) => void
  setIsDrawerOpen: (open: boolean) => void

  // --- ASYNC DRAFT MANAGEMENT ACTIONS ---
  fetchAvailableDrafts: (onPurgeNotice?: (slug: string) => void) => Promise<void>
  initializeNewDraft: () => void
  loadExistingDraft: (draftId: string) => Promise<string | null>
  saveCurrentDraft: (userContext: UserContext, htmlContent: string) => Promise<boolean>
  publishDraft: (userContext: UserContext, htmlContent: string) => Promise<{ success: boolean; postSlug?: string; error?: string }>

  updateManifest: (userContext: { accountId: string; accountSlug: string }) => Promise<ManifestEntry[] | null>
  unpublishPost: (userContext: { accountId: string; accountSlug: string }, postSlug: string) => Promise<{ success: boolean; error?: string }>
  deletePost: (userContext: { accountId: string; accountSlug: string }, postSlug: string) => Promise<{ success: boolean; error?: string }>

}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial State
  draftId: 'temp-draft',
  title: '',
  subTitle: '',
  customSlug: '',
  isDirty: false,
  isSaving: false,
  isPublishing: false,
  isLoadingDrafts: false,
  availableDrafts: [],
  blobMap: {},
  isDrawerOpen: false,
  templateId: 'simple-blog',

  setDraftId: (id) => set({ draftId: id }),
  setTitle: (title) => set({ title, isDirty: true }),
  setSubTitle: (subTitle) => set({ subTitle, isDirty: true }),
  setCustomSlug: (customSlug) => set({ customSlug, isDirty: true }),
  setTemplateId: (templateId) => set({ templateId, isDirty: true }),
  setIsDrawerOpen: (open) => set({ isDrawerOpen: open }),

  registerBlob: (blobUrl, fileName) =>
    set((state) => ({
      blobMap: { ...state.blobMap, [blobUrl]: fileName },
      isDirty: true,
    })),

  /**
   * Scans OPFS using the recursive scanner. Automatically repairs incomplete JSON
   * or purges empty/unrepairable folders, populating `availableDrafts`.
   */
  fetchAvailableDrafts: async (onPurgeNotice) => {
    set({ isLoadingDrafts: true })
    try {
      const drafts = await getOPFSPosts('publishing/drafts', onPurgeNotice)
      set({ availableDrafts: drafts })
    } catch (err) {
      console.error('Failed to fetch drafts from OPFS:', err)
      set({ availableDrafts: [] })
    } finally {
      set({ isLoadingDrafts: false })
    }
  },

  initializeNewDraft: () => {
    set({
      draftId: crypto.randomUUID(),
      title: '',
      subTitle: '',
      customSlug: '',
      isDirty: false,
      blobMap: {},
    })
  },

  loadExistingDraft: async (draftId) => {
    const data = await loadDraft(draftId)
    if (!data) return null

    set({
      draftId: data.metadata.id || draftId,
      title: data.metadata.title,
      subTitle: data.metadata.subTitle || '',
      customSlug: data.metadata.customSlug,
      blobMap: data.metadata.blobMap || {},
      isDirty: false,
    })

    return data.htmlContent
  },

  saveCurrentDraft: async (userContext, htmlContent) => {
    const { draftId, title, customSlug, blobMap, subTitle } = get()
    
    if (draftId === 'temp-draft' && !title && Object.keys(blobMap).length === 0) {
      return true
    }

    set({ isSaving: true })

    const success = await saveDraft(
      draftId,
      { userId: userContext.userId, accountId: userContext.accountId },
      { title, subTitle, customSlug, blobMap, isSaved: true },
      htmlContent
    )

    set({ isSaving: false, isDirty: false })

    // Refresh draft list so the modal reflects title or modified updates immediately
    get().fetchAvailableDrafts()
    return success
  },



/**
   * Scans R2 articles, uploads an updated manifest.json, and syncs local /published/ directory.
   */
  updateManifest: async (userContext) => {
    try {
      const manifest = await syncAndUploadManifest(userContext)
      await reconcileLocalPublishedWithManifest(manifest)
      return manifest
    } catch (err: any) {
      console.error('Failed to update manifest:', err)
      return null
    }
  },

  /**
   * Unpublishes a post (removes from public site / DB / R2, returns status to unpublished),
   * updates manifest, and removes it from local /published/ storage.
   */
  unpublishPost: async (userContext, postSlug) => {
    try {
      const res = await fetch('/api/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: userContext.accountId,
          accountSlug: userContext.accountSlug,
          postSlug,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to unpublish post from server.')
      }

      // Cleanup local OPFS published copy
      await removeLocalPublishedPost(postSlug)

      // Sync updated R2 manifest and reconcile local state
      await get().updateManifest(userContext)
      await get().fetchAvailableDrafts()

      return { success: true }
    } catch (err: any) {
      console.error('Failed to unpublish post:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * Permanently deletes a post across DB, R2 bucket media, manifest, and OPFS storage.
   */
  deletePost: async (userContext, postSlug) => {
    try {
      const res = await fetch('/api/delete-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: userContext.accountId,
          accountSlug: userContext.accountSlug,
          postSlug,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete post.')
      }

      // Cleanup local OPFS copy
      await removeLocalPublishedPost(postSlug)

      // Sync updated R2 manifest and reconcile local state
      await get().updateManifest(userContext)
      await get().fetchAvailableDrafts()

      return { success: true }
    } catch (err: any) {
      console.error('Failed to delete post:', err)
      return { success: false, error: err.message }
    }
  },

  /**
   * Updated publishDraft action now triggering updateManifest upon completion
   */
  publishDraft: async (userContext, htmlContent) => {
    const { draftId, title, customSlug, blobMap, saveCurrentDraft, initializeNewDraft, fetchAvailableDrafts, updateManifest } = get()

    if (!userContext.accountSlug) {
      return { success: false, error: 'Account slug is required for publishing.' }
    }

    const finalSlug = customSlug.trim() || title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
    if (!finalSlug) {
      return { success: false, error: 'A title or custom slug is required to publish.' }
    }

    set({ isPublishing: true })

    try {
      await saveCurrentDraft(userContext, htmlContent)

      const finalHtmlContent = await uploadDraftMediaToR2(
        draftId,
        { accountId: userContext.accountId, accountSlug: userContext.accountSlug },
        finalSlug,
        blobMap,
        htmlContent
      )

      const publishRes = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: userContext.accountId,
          accountSlug: userContext.accountSlug,
          postSlug: finalSlug,
          title,
          contentHtml: finalHtmlContent,
        }),
      })

      if (!publishRes.ok) {
        const err = await publishRes.json()
        throw new Error(err.error || 'Failed to save published post to database')
      }

      try {
        await moveDraftToPublished(draftId, finalSlug)
      } catch (moveErr) {
        console.warn('Post published, but moving OPFS draft failed:', moveErr)
      }

      // Trigger manifest sync across R2 and OPFS
      await updateManifest({ accountId: userContext.accountId, accountSlug: userContext.accountSlug })

      initializeNewDraft()
      fetchAvailableDrafts()

      return { success: true, postSlug: finalSlug }
    } catch (err: any) {
      console.error('Publishing pipeline failed:', err)
      return { success: false, error: err.message }
    } finally {
      set({ isPublishing: false })
    }
  }
}))