import { create } from 'zustand'
import { 
  
  TemplateId, 
  BlogPost, 
  ManifestPost, 
  UserContext,
  AuthorContext,
  getDirectory
} from '@/components/blog/blogHelpers'
import { 
  removeLocalPublishedPost, 
  reconcileLocalPublishedWithManifest, 
  syncAndUploadManifest, 
  getOPFSPosts, 
  uploadDraftMediaToR2, 
  moveDraftToPublished, 
  movePublishedToDraft,
  downloadAndSavePublishedPost,
  saveDraft, 
  loadDraft, 
  loadPublished, 
} from "@/components/data/diskOPFS"

import { getProfileFromUserId } from '@/lib/supabase/client_queries'

export type ActiveTab = 'editor' | 'drafts' | 'published'

interface EditorState {
  // --- NAVIGATION & VIEW ---
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void

  // --- STATE PROPERTIES ---
  draftId: string
  liveTitle: string
  liveSubTitle: string
  customSlug: string
  isDirty: boolean
  isSaving: boolean
  isPublishing: boolean
  isUnpublishing: boolean
  isLoadingDrafts: boolean
  availableDrafts: BlogPost[]
  availablePublished: BlogPost[]
  blobMap: Record<string, string>
  isDrawerOpen: boolean
  templateId: TemplateId
  showToolbar: boolean
  currentPost: BlogPost | null
  isNewDocModalOpen: boolean

  // --- SYNCHRONOUS ACTIONS --- //
  setCurrentPost: (post: BlogPost | null) => void
  setDraftId: (id: string) => void
  setLiveTitle: (title: string) => void
  setLiveSubTitle: (subTitle: string) => void
  setCustomSlug: (slug: string) => void
  setTemplateId: (id: TemplateId) => void
  registerBlob: (blobUrl: string, fileName: string) => void
  setIsDrawerOpen: (open: boolean) => void
  setIsNewDocModalOpen: (open: boolean) => void
  setShowToolbar: (open: boolean) => void
  toggleToolbar: () => void

  // --- ASYNC ACTIONS --- //
  fetchAvailableDrafts: (onPurgeNotice?: (slug: string) => void) => Promise<void>
  fetchAvailablePublished: (userContext: UserContext) => Promise<void>
  initializeNewDraft: () => void
  loadExistingDraft: (draftId: string) => Promise<string | null>
  loadExistingPub: (pubId: string) => Promise<string | null>
  saveCurrentDraft: (userContext: UserContext, htmlContent: string) => Promise<BlogPost | null>
  publishDraft: (userContext: UserContext, htmlContent: string) => Promise<{ success: boolean; postSlug?: string; error?: string }>
  updateManifest: (userContext: UserContext) => Promise<ManifestPost[] | null>
  unpublishPost: (userContext: UserContext, postId: string, postSlug: string) => Promise<{ success: boolean; error?: string }>
  deletePost: (userContext: UserContext, postId: string, postSlug: string) => Promise<{ success: boolean; error?: string }>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Navigation
  activeTab: 'editor' as ActiveTab,
  setActiveTab: (activeTab) => set({ activeTab }),

  // Initial State
  draftId: crypto.randomUUID(),
  liveTitle: '',
  liveSubTitle: '',
  customSlug: '',
  isDirty: false,
  isSaving: false,
  isPublishing: false,
  isUnpublishing: false,
  isLoadingDrafts: false,
  availableDrafts: [],
  availablePublished: [],
  blobMap: {},
  isDrawerOpen: false,
  templateId: 'simple-blog',
  showToolbar: false,
  currentPost: null,
  isNewDocModalOpen: false,

  // Synchronous Actions
  setCurrentPost: (currentPost) => 
  set((state) => {
    if (!currentPost) {
      return { currentPost: null }
    }

    return {
      currentPost,
      draftId: currentPost.id || state.draftId,
      liveTitle: currentPost.title ?? state.liveTitle,
      liveSubTitle: currentPost.subTitle ?? state.liveSubTitle ?? '',
      customSlug: currentPost.slug ?? state.customSlug,
      blobMap: currentPost.blobMap ?? state.blobMap ?? {},
    }
  }),
  setDraftId: (id) => set({ draftId: id }),
  setLiveTitle: (liveTitle) => set({ liveTitle, isDirty: true }),
  setLiveSubTitle: (liveSubTitle) => set({ liveSubTitle, isDirty: true }),
  setCustomSlug: (customSlug) => set({ customSlug, isDirty: true }),
  setTemplateId: (templateId) => set({ templateId, isDirty: true }),
  setIsDrawerOpen: (open) => set({ isDrawerOpen: open }),
  setIsNewDocModalOpen: (open) => set({ isNewDocModalOpen: open }),

  setShowToolbar: (open) => set({ showToolbar: open }),
  toggleToolbar: () => set((state) => ({ showToolbar: !state.showToolbar })),

  registerBlob: (blobUrl, fileName) =>
    set((state) => ({
      blobMap: { ...state.blobMap, [blobUrl]: fileName },
      isDirty: true,
    })),

  fetchAvailableDrafts: async (onPurgeNotice) => {
    set({ isLoadingDrafts: true })
    try {
      const drafts = await getOPFSPosts('publishing/drafts', onPurgeNotice)
      console.log("aavailable draaafts: ", drafts)
      set({ availableDrafts: drafts })
    } catch (err) {
      console.error('Failed to fetch OPFS drafts:', err)
      set({ availableDrafts: [] })
    } finally {
      set({ isLoadingDrafts: false })
    }
  },

fetchAvailablePublished: async (userContext) => {
  if (!userContext.accountId || !userContext.accountSlug) {
    console.error('fetchAvailablePublished aborted: Invalid UserContext.')
    set({ availablePublished: [] })
    return
  }

  try {
    let localPublished = await getOPFSPosts('publishing/published')
    console.log("local published: ", localPublished)

    const res = await fetch('/api/list-published', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userContext),
    })

    if (res.ok) {
      const data = await res.json()
      const remotePosts: Array<any> = data.posts || data.manifest || []

      const localIds = new Set(localPublished.map((p) => p.id))

      // 1. Normalize items to match expected properties
      const missingFromLocal = remotePosts
        .map((p) => ({
          postId: p.postId || p.id,
          postSlug: p.postSlug || p.slug,
          title: p.title,
          createdAt: p.createdAt || p.publishedAt,
        }))
        .filter((item) => item.postId && !localIds.has(item.postId))

      console.log("missing from local: ", missingFromLocal)

      // 2. Download missing items with resolved parameters
      if (missingFromLocal.length > 0) {
        await Promise.allSettled(
          missingFromLocal.map((missingItem) =>
            downloadAndSavePublishedPost(userContext, missingItem)
          )
        )
        localPublished = await getOPFSPosts('publishing/published')
      }
    }

    set({ availablePublished: localPublished })
  } catch (err) {
    console.error('Failed to fetch/sync OPFS published posts:', err)
    set({ availablePublished: [] })
  }
},

  initializeNewDraft: () => {
    const newUuid = crypto.randomUUID()
    set({
      activeTab: 'editor',
      draftId: newUuid,
      currentPost: null,
      liveTitle: '',
      liveSubTitle: '',
      customSlug: '',
      isDirty: false,
      blobMap: {},
    })
  },

  loadExistingDraft: async (draftId) => {
    const post = await loadDraft(draftId)
    if (!post) return null

    set({
      activeTab: 'editor',
      draftId: post.id,
      currentPost: post,
      liveTitle: post.title,
      liveSubTitle: post.subTitle || '',
      customSlug: post.slug || '',
      blobMap: post.blobMap || {},
      isDirty: false,
    })

    return post.content || null
  },

  loadExistingPub: async (pubId) => {
    const post = await loadPublished(pubId)
    if (!post) return null

    set({
      activeTab: 'editor',
      draftId: post.id,
      currentPost: post,
      liveTitle: post.title,
      liveSubTitle: post.subTitle || '',
      customSlug: post.slug || '',
      blobMap: post.blobMap || {},
      isDirty: false,
    })

    return post.content || null
  },

 saveCurrentDraft: async (userContext, htmlContent): Promise<BlogPost | null> => {
    const { draftId, liveTitle, liveSubTitle, customSlug, blobMap, currentPost, setCurrentPost } = get()

    const uProfile = getProfileFromUserId(userContext.userId)
    // 1. Ensure permanent UUID
    const targetId = !draftId || draftId === 'temp-draft' ? crypto.randomUUID() : draftId
    const now = new Date().toISOString()

    const resolvedSlug =
      customSlug.trim() ||
      (liveTitle ? liveTitle.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') : targetId)

    const author: AuthorContext = {
      userId: userContext.userId,
      accountId: userContext.accountId,
      accountSlug: userContext.accountSlug,
      name: userContext.accountSlug || 'Author',
    }

    const postToSave: BlogPost = {
      id: targetId,
      slug: resolvedSlug,
      title: liveTitle || 'Untitled Post',
      subTitle: liveSubTitle || null,
      status: 'draft',
      createdAt: currentPost?.createdAt || now,
      dateLastEdited: now,
      author,
      blobMap,
      dirHandle: currentPost?.dirHandle || null,
    }

    set({ isSaving: true, draftId: targetId })

    const { success, dirHandle } = await saveDraft(postToSave, htmlContent)

    if (success) {
      setCurrentPost({
        ...postToSave,
        content: htmlContent,
        dirHandle: dirHandle || postToSave.dirHandle,
      })
    }

    set({ isSaving: false, isDirty: false })
    await get().fetchAvailableDrafts()
    
    return success ? postToSave : null
  },

  updateManifest: async (userContext) => {
    try {
      const manifest = await syncAndUploadManifest(userContext) 
      await reconcileLocalPublishedWithManifest(manifest) 
      
      await get().fetchAvailablePublished(userContext)
      await get().fetchAvailableDrafts()
      
      return manifest
    } catch (err: any) {
      console.error('Failed to update manifest:', err)
      return null
    }
  },

  unpublishPost: async (userContext, postId, postSlug) => {
    set({ isUnpublishing: true })

    try {
      const res = await fetch('/api/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: userContext.accountId,
          accountSlug: userContext.accountSlug,
          postId,
          postSlug,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to unpublish post from R2.')
      }

      await movePublishedToDraft(postId)
      await removeLocalPublishedPost(postId)
      await get().updateManifest(userContext)

      return { success: true }
    } catch (err: any) {
      console.error('Failed to unpublish post:', err)
      return { success: false, error: err.message }
    } finally {
      set({ isUnpublishing: false })
    }
  },

  deletePost: async (userContext, postId, postSlug) => {
    try {
      const res = await fetch('/api/delete-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: userContext.accountId,
          accountSlug: userContext.accountSlug,
          postId,
          postSlug,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete post.')
      }

      await removeLocalPublishedPost(postId)
      await get().updateManifest(userContext)
      await get().fetchAvailableDrafts()
      await get().fetchAvailablePublished(userContext)

      return { success: true }
    } catch (err: any) {
      console.error('Failed to delete post:', err)
      return { success: false, error: err.message }
    }
  },

  publishDraft: async (userContext, htmlContent) => {
    const { 
      draftId, 
      liveTitle, 
      liveSubTitle,
      customSlug, 
      blobMap, 
      saveCurrentDraft, 
      fetchAvailableDrafts, 
      fetchAvailablePublished, 
      updateManifest,
      setCurrentPost 
    } = get()

    if (!userContext.accountSlug) {
      return { success: false, error: 'Account slug is required for publishing.' }
    }

    const finalSlug = customSlug.trim() || liveTitle.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
    if (!finalSlug) {
      return { success: false, error: 'A title or custom slug is required to publish.' }
    }

    set({ isPublishing: true })

    try {
        console.log("USER CONTECTST: ", userContext)
      // Upload media blobs to R2
      const finalHtmlContent = await uploadDraftMediaToR2(
        draftId,
        { accountId: userContext.accountId, accountSlug: userContext.accountSlug },
        finalSlug,
        blobMap,
        htmlContent
      )

      // 3. Trigger remote publish endpoint
      const publishRes = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: userContext.accountId,
          accountSlug: userContext.accountSlug,
          postId: draftId,
          postSlug: finalSlug,
          title: liveTitle,
          contentHtml: finalHtmlContent,
        }),
      })

      if (!publishRes.ok) {
        const err = await publishRes.json()
        throw new Error(err.error || 'Failed to publish post to R2 storage')
      }

      // 4. Move local folder from publishing/drafts/ -> publishing/published/
      try {
        await moveDraftToPublished(draftId)
      } catch (moveErr) {
        console.warn('Post published to R2, but moving local OPFS draft failed:', moveErr)
      }

      await updateManifest(userContext)

      // 5. Retrieve published directory handle and update currentPost state
      const now = new Date().toISOString()
      let pubDirHandle = null
      try {
        pubDirHandle = await getDirectory(`publishing/published/${draftId}`)
      } catch (hErr) {
        console.warn("Could not retrieve published OPFS directory handle:", hErr)
      }

      setCurrentPost({
        id: draftId,
        slug: finalSlug,
        title: liveTitle || 'Untitled Post',
        subTitle: liveSubTitle || null,
        content: finalHtmlContent,
        status: 'published',
        createdAt: now,
        dateLastEdited: now,
        author: {
          userId: userContext.userId,
          accountId: userContext.accountId,
          accountSlug: userContext.accountSlug,
          name: userContext.accountSlug || 'Author',
        },
        dirHandle: pubDirHandle,
      })

      await fetchAvailableDrafts()
      await fetchAvailablePublished(userContext)

      return { success: true, postSlug: finalSlug }
    } catch (err: any) {
      console.error('Publishing pipeline failed:', err)
      return { success: false, error: err.message }
    } finally {
      set({ isPublishing: false })
    }
  },
}))