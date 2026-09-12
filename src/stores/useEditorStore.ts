import { create } from 'zustand'
import { saveDraft, loadDraft,TemplateId, DraftMetadata} from '@/components/blog/blogHelpers'
import {getDirectory, getOPFSEntries} from "@/components/data/diskOPFS"


/**
 * Contextual credentials for the logged-in user and active account workspace.
 * Required for security scoping and structuring Cloudflare R2 object storage keys.
 */
interface UserContext {
  userId: string        // Supabase/Auth user unique identifier
  accountId: string     // Active account/team context ID
  accountSlug?: string  // URL-safe account name used for R2 directory routing
}

/**
 * Interface defining the Zustand editor store state and available actions.
 */
interface EditorState {
  // --- STATE PROPERTIES ---
  
  /** Unique ID of the active draft directory in OPFS (`publishing/drafts/<draftId>/`). */
  draftId: string
  
  /** Post title stored in metadata. */
  title: string

  subTitle: string;
    /** Sets post title and marks state dirty for autosave. */
  
  
  
  /** Optional custom URL slug override set by the user. */
  customSlug: string
  
  /** Tracked flag indicating unsaved text or media modifications exist. */
  isDirty: boolean
  
  /** Status indicator for active OPFS metadata/HTML flushes. */
  isSaving: boolean
  
  /** Status indicator for active network operations (R2 uploads + DB commit). */
  isPublishing: boolean
  
  /** 
   * Active mapping between transient in-memory Object URLs (`blob:http...`) 
   * and their persistent WebP filenames stored inside OPFS (`/media/filename.webp`).
   */
  blobMap: Record<string, string>
  
  /** Controls visibility of the "Open Saved Drafts" drawer/modal UI. */
  isDrawerOpen: boolean

  templateId: TemplateId
    setTemplateId: (id: TemplateId) => void

  // --- SYNCHRONOUS ACTIONS ---
  
  /** Direct override for active draftId. */
  setDraftId: (id: string) => void
  
  /** Sets post title and marks state dirty for autosave. */
  setTitle: (title: string) => void

  setSubTitle: (subTitle: string) => void
  
  /** Sets custom post slug and marks state dirty for autosave. */
  setCustomSlug: (slug: string) => void
  
  /** Associates an in-memory blob URL with an OPFS filename. */
  registerBlob: (blobUrl: string, fileName: string) => void
  
  /** Opens or closes the saved drafts selection drawer. */
  setIsDrawerOpen: (open: boolean) => void
  
  // --- ASYNC LIFECYCLE & PERSISTENCE ACTIONS ---
  
  /** Resets store state and assigns a new UUID to prepare a blank canvas. */
  initializeNewDraft: () => void
  
  /** Reads an existing draft from OPFS, rehydrates blob URLs, and returns HTML for Tiptap. */
  loadExistingDraft: (draftId: string) => Promise<string | null>
  
  /** Flushes current memory state into `draft.json` and `content.html` in OPFS. */
  persistCurrentDraft: (userContext: UserContext, htmlContent: string) => Promise<boolean>
  
  /** 
   * Finalizes post: uploads local OPFS WebP media to Cloudflare R2, rewrites image HTML 
   * to point to R2 CDN URLs, commits the post to the backend DB, and deletes local OPFS draft.
   */
  publishDraft: (userContext: UserContext, htmlContent: string) => Promise<{ success: boolean; postSlug?: string; error?: string }>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Default Initial State
  draftId: 'temp-draft',
  title: '',
  subTitle: '',
  customSlug: '',
  isDirty: false,
  isSaving: false,
  isPublishing: false,
  blobMap: {},
  isDrawerOpen: false,

  setDraftId: (id) => set({ draftId: id }),
  setTitle: (title) => set({ title, isDirty: true }),
  setSubTitle: (subTitle) => set({ subTitle, isDirty: true }),
  setCustomSlug: (customSlug) => set({ customSlug, isDirty: true }),
  setIsDrawerOpen: (open) => set({ isDrawerOpen: open }),
  
  /**
   * Called when an image is processed and dropped/pasted into the canvas.
   * Maps the live preview blob URL to the filename saved in OPFS `/media`.
   */
  registerBlob: (blobUrl, fileName) =>
    set((state) => ({
      blobMap: { ...state.blobMap, [blobUrl]: fileName },
      isDirty: true,
    })),

  /**
   * Resets the store back to a pristine state and assigns a unique draft UUID.
   * Call this when clicking "New Draft" or after successfully publishing a post.
   */
  initializeNewDraft: () => {
    set({
      draftId: crypto.randomUUID(),
      title: '',
      customSlug: '',
      isDirty: false,
      blobMap: {},
    })
  },

  templateId: 'simple-blog',
  setTemplateId: (templateId) => set({ templateId, isDirty: true }),
  /**
   * Rehydrates a saved draft session from OPFS.
   * Reads metadata, updates store properties, generates fresh live Object URLs
   * for local media binaries, and passes rehydrated HTML back to the Tiptap canvas.
   * 
   * @param draftId - The directory name inside `publishing/drafts/`
   * @returns Rehydrated HTML string ready for Tiptap editor engine, or null on failure.
   */
  loadExistingDraft: async (draftId) => {
    const data = await loadDraft(draftId)
    if (!data) return null

    // Update store state with loaded metadata
    set({
      draftId: data.metadata.id,
      title: data.metadata.title,
      customSlug: data.metadata.customSlug,
      blobMap: data.metadata.blobMap,
      isDirty: false,
    })

    return data.htmlContent
  },

  /**
   * Writes active state (`title`, `customSlug`, `blobMap`) and editor HTML content
   * into OPFS under `publishing/drafts/<draftId>/`.
   * 
   * @param userContext - Active userId and accountId for access control
   * @param htmlContent - Current serialized HTML string from Tiptap (`editor.getHTML()`)
   * @returns Boolean representing operation success
   */
  persistCurrentDraft: async (userContext, htmlContent) => {
    const { draftId, title, customSlug, blobMap } = get()
    
    // Protection guard: Avoid cluttering OPFS with un-edited blank temporary sessions
    if (draftId === 'temp-draft' && !title && Object.keys(blobMap).length === 0) {
      return true
    }

    set({ isSaving: true })

    // Write metadata and HTML content to OPFS storage
    const success = await saveDraft(
      draftId,
      { userId: userContext.userId, accountId: userContext.accountId },
      { title, customSlug, blobMap, isSaved: true },
      htmlContent
    )

    set({ isSaving: false, isDirty: false })
    return success
  },

  /**
   * The "Publish = Commit" pipeline executing the local-to-cloud sync:
   * 1. Flushes latest editor state to OPFS.
   * 2. Reads binary images stored in `publishing/drafts/<draftId>/media/`.
   * 3. Uploads each media file to Cloudflare R2 bucket via `/api/upload`.
   * 4. Swaps local `blob:` HTML `src` links with production R2 CDN URLs.
   * 5. Commits final payload to backend database via `/api/publish`.
   * 6. Deletes local OPFS draft files upon successful database write.
   * 
   * @param userContext - Current user & account info (must contain `accountSlug`)
   * @param htmlContent - Current raw Tiptap canvas HTML
   */
  publishDraft: async (userContext, htmlContent) => {
    const { draftId, title, customSlug, blobMap, persistCurrentDraft, initializeNewDraft } = get()
    
    if (!userContext.accountSlug) {
      return { success: false, error: 'Account slug is required for publishing.' }
    }

    // Determine production post URL slug: use customSlug if set, otherwise auto-slugify the title
    const finalSlug = customSlug.trim() || title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
    if (!finalSlug) {
      return { success: false, error: 'A title or custom slug is required to publish.' }
    }

    set({ isPublishing: true })

    try {
      // Step 1: Ensure draft state is synced locally before publishing
      await persistCurrentDraft(userContext, htmlContent)
      let finalHtmlContent = htmlContent

      // Step 2: Fetch binary files from OPFS media folder
      const mediaEntries = await getOPFSEntries(`publishing/drafts/${draftId}/media`)
      
      // Step 3 & 4: Upload each image file to R2 and replace blob URLs in HTML content
      for (const { name, handle } of mediaEntries) {
        const file = await handle.getFile()
        
        const formData = new FormData()
        formData.append('file', file)
        formData.append('accountId', userContext.accountId)
        formData.append('accountSlug', userContext.accountSlug)
        formData.append('postSlug', finalSlug)

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        const data = await res.json()
        if (!res.ok) throw new Error(`Upload failed for ${name}: ${data.error}`)

        // Identify local in-memory blob URL linked to this OPFS file
        const blobUrlEntry = Object.entries(blobMap).find(([_, mappedName]) => mappedName === name)
        
        if (blobUrlEntry) {
          const oldBlobUrl = blobUrlEntry[0]
          // Swap local blob reference with the live Cloudflare R2 CDN URL
          finalHtmlContent = finalHtmlContent.replaceAll(oldBlobUrl, data.url)
        }
      }

      // Step 5: Save published post metadata and updated HTML content to Database
      const publishRes = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: userContext.accountId,
          postSlug: finalSlug,
          title,
          htmlContent: finalHtmlContent,
        }),
      })

      if (!publishRes.ok) {
        const err = await publishRes.json()
        throw new Error(err.error || 'Failed to save published post to database')
      }

      // Step 6: Purge local OPFS draft directory since it is now published live
      try {
        const draftsFolder = await getDirectory('publishing/drafts')
        await draftsFolder.removeEntry(draftId, { recursive: true })
      } catch (cleanupErr) {
        console.warn('Post published, but OPFS local cleanup encountered an issue:', cleanupErr)
      }

      // Step 7: Reset editor store for next writing session
      initializeNewDraft()
      
      return { success: true, postSlug: finalSlug }
    } catch (err: any) {
      console.error('Publishing pipeline encountered an error:', err)
      return { success: false, error: err.message }
    } finally {
      set({ isPublishing: false })
    }
  }
}))