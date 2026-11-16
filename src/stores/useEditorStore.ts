import { create } from 'zustand'
import { 
  TemplateId, 
  BlogPost, 
  UserContext,
  AuthorContext,
  getDirectory,
  updatePostJson
} from '@/components/blog/blogHelpers'
import { 
  removeLocalPost, 
  getOPFSPosts, 
  uploadDraftMediaToR2,
  downloadAndSavePublishedPost,
  saveDraft, 
  loadPost
} from "@/components/data/diskOPFS"
import { renderFullPage } from "@/lib/blog/template";
import { rebuildLocalManifest } from '@/components/data/diskOPFS';


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

  heroImage: string | null,
  setHeroImage: (url: string | null) => void,

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
  fetchAvailableDrafts: () => Promise<void>
  fetchAvailablePublished: (userContext: UserContext) => Promise<void>
  initializeNewDraft: () => void
  loadPost: (postId: string) => Promise<string | null>
  saveCurrentDraft: (userContext: UserContext, htmlContent: string) => Promise<BlogPost | null>
  publishPost: (userContext: UserContext, htmlContent: string) => Promise<{ success: boolean; postSlug?: string; error?: string }>
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

  heroImage: null,
  setHeroImage: (url: string | null) => set({ heroImage: url }),

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

  fetchAvailableDrafts: async () => {
    set({ isLoadingDrafts: true })
    try {
      const drafts = await getOPFSPosts('draft')
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
      let localPublished = await getOPFSPosts('published')
      console.log("local published: ", localPublished)

      const res = await fetch('/api/list-published', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userContext),
      })

      if (res.ok) {
        const data = await res.json()
        // remotePosts here just wants to be a list of IDs
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
          localPublished = await getOPFSPosts('published')
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

  loadPost: async (postId) => {
    const post = await loadPost(postId)
    if (!post) return null

    set({
      activeTab: 'editor',
      draftId: post.id,
      currentPost: post,
      liveTitle: post.title,
      liveSubTitle: post.subTitle || '',
      customSlug: post.slug || '',
      blobMap: post.blobMap || {},
      heroImage: post.heroImage,
      isDirty: false,
    })

    return post.content || null
  },

  saveCurrentDraft: async (userContext, htmlContent): Promise<BlogPost | null> => {
    const { draftId, liveTitle, liveSubTitle, customSlug, blobMap, currentPost, setCurrentPost } = get()

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
    await rebuildLocalManifest()
    await get().fetchAvailableDrafts()
    
    return success ? postToSave : null
  },

  unpublishPost: async (userContext, postId, postSlug) => {
    set({ isUnpublishing: true })

    try {
      // 1. Call server API to delete the post folder from R2 and rebuild the root manifest
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

      let updatedMetadata = await updatePostJson(postId, {status: 'draft' as const})
    
      if (!updatedMetadata) {
        throw new Error('Post was removed from R2, but updating local OPFS status failed.')
      }
      
      // 3. Update editor store state to reflect the draft status
      set({
        heroImage: updatedMetadata.heroImage || null,
        liveTitle: updatedMetadata.title || '',
        liveSubTitle: updatedMetadata.subTitle || '',
      })
      await rebuildLocalManifest()

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
        throw new Error(err.error || 'Failed to delete post.')
      }

      await removeLocalPost(postId)
      await rebuildLocalManifest()
      await get().fetchAvailableDrafts()
      await get().fetchAvailablePublished(userContext)



      return { success: true }
    } catch (err: any) {
      console.error('Failed to delete post:', err)
      return { success: false, error: err.message }
    }
  },

  // UserContext is basically Author Context by another name
  publishPost: async (userContext, htmlContent) => {
    const { 
      draftId, 
      liveTitle, 
      liveSubTitle,
      heroImage,
      customSlug, 
      blobMap, 
      fetchAvailableDrafts, 
      fetchAvailablePublished, 
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
      // 1. Upload media blobs to R2
      const { finalHtmlContent, finalHeroUrl } = await uploadDraftMediaToR2(
        draftId,
        userContext,
        finalSlug,
        blobMap,
        htmlContent,
        heroImage
      )
      
      const cleanTitle = liveTitle.replace(/\s*\|\s*[\w-]+$/, '').trim()
      const now = new Date().toISOString()

      // 2. Generate the full HTML Page for index.html
      const fullHtml = renderFullPage({
        title: cleanTitle,
        subTitle: liveSubTitle,
        heroImage: finalHeroUrl || '', 
        contentHtml: finalHtmlContent,
        accountSlug: userContext.accountSlug,
      });

      // 3. Update local OPFS post.json with published status and metadata using your helper
      const updatedMetadata = await updatePostJson(draftId, {
        id: draftId,
        slug: finalSlug,
        title: cleanTitle,
        subTitle: liveSubTitle || null,
        status: 'published',
        dateLastEdited: now,
        heroImage: finalHeroUrl || null,
        author: {
          userId: userContext.userId,
          accountId: userContext.accountId,
          accountSlug: userContext.accountSlug,
          name: userContext.name || userContext.accountSlug || 'Author',
        },
      })

      if (!updatedMetadata) {
        throw new Error('Failed to update local post.json metadata before publishing.')
      }

      // 4. Send the pre-rendered HTML and finalized post.json metadata to the API route
      const publishRes = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: draftId,
          accountSlug: userContext.accountSlug,
          postSlug: finalSlug,
          postMetadata: updatedMetadata,
          indexHtml: fullHtml,
        }),
      })

      if (!publishRes.ok) {
        const err = await publishRes.json()
        throw new Error(err.error || 'Failed to publish post to R2 storage')
      }

      // 5. SUCCESS! Get the directory handle for local store reference
      const localDirHandle = await getDirectory(`publishing/${draftId}`)

      // 6. Update currentPost state with the new published state
      setCurrentPost({
        ...updatedMetadata,
        content: finalHtmlContent,
        dirHandle: localDirHandle,
      })

      await rebuildLocalManifest()
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