'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

import { DocumentListView } from './DocumentListView'
import { EditorCanvas } from './EditorCanvas'

import styles from '@/app/styles/editor.module.css'
import { convertToWebP, UserContext } from './blogHelpers'
import { saveDraftMedia } from '@/components/data/diskOPFS'
import { useEditorStore } from '@/stores/useEditorStore'
import { useAppStore } from '@/providers/AppStoreProvider'
import { DraftSaveModal } from '@/components/helpers/DraftSaveModal'
import { DraftFinderModal } from '@/components/helpers/DraftFinderModal'
import { NewDocModal } from '../helpers/NewDocModal'

import { SlashCommand, COMMANDS, renderItems } from './SlashCommand'
import { Highlight } from '@tiptap/extension-highlight'

export function WritingTool({ initialDraftId }: { initialDraftId?: string }) {
  const router = useRouter()
  
  // AppStore auth states
  const activeAccount = useAppStore((s) => s.activeAccount)
  const user = useAppStore((s) => s.userId)
  const profile = useAppStore((s) => s.profile)
  const authStatus = useAppStore((s) => s.authStatus)

  // EditorStore states & actions
  const draftId = useEditorStore((s) => s.draftId)
  const availableDrafts = useEditorStore((s) => s.availableDrafts)
  const availablePublished = useEditorStore((s) => s.availablePublished)
  const activeTab = useEditorStore((s) => s.activeTab)
  
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const registerBlob = useEditorStore((s) => s.registerBlob)
  const loadExistingDraft = useEditorStore((s) => s.loadExistingDraft)
  const loadExistingPub = useEditorStore((s) => s.loadExistingPub)
  const fetchAvailableDrafts = useEditorStore((s) => s.fetchAvailableDrafts)
  const fetchAvailablePublished = useEditorStore((s) => s.fetchAvailablePublished)
  const setIsNewDocModalOpen = useEditorStore((s) => s.setIsNewDocModalOpen)
  const isNewDocModalOpen = useEditorStore((s) => s.isNewDocModalOpen)
  const setCurrentPost = useEditorStore((s) => s.setCurrentPost)

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isProcessingMedia, setIsProcessingMedia] = useState(false)

  // Derive UserContext when authenticated
  const userContext = useMemo<UserContext | null>(() => {
    if (!user || !activeAccount || !profile) return null

    let accountSlug = activeAccount.account_slug
    if (!accountSlug && activeAccount.name) {
      accountSlug = activeAccount.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
    }

    if (!accountSlug) return null

    return {
      userId: user,
      accountId: activeAccount.id,
      accountSlug,
      name: profile.display_name || activeAccount.name || activeAccount.account_slug+' Author',
    }
  }, [user, activeAccount])

  // Redirect ONLY when authentication resolves as 'unauthenticated'
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login')
    }
  }, [authStatus, router])

async function handleImagePipeline(
  rawFile: File, 
  targetEditor?: any, 
  pos?: number
) {
  const activeEditor = targetEditor || editor
  if (!activeEditor) return

  setIsProcessingMedia(true)
  try {
    const processedFile = await convertToWebP(rawFile)
    const fileName = `${Date.now()}-img.webp`
    await saveDraftMedia(draftId, fileName, processedFile)
    const localBlobUrl = URL.createObjectURL(processedFile)
    registerBlob(localBlobUrl, fileName)

    // Ensure editor receives explicit focus and target cursor position
    if (typeof pos === 'number') {
      activeEditor.chain().focus().setTextSelection(pos).setImage({ src: localBlobUrl }).run()
    } else {
      activeEditor.chain().focus().setImage({ src: localBlobUrl }).run()
    }
  } catch (err) {
    console.error('Failed to process image:', err)
  } finally {
    setIsProcessingMedia(false)
  }
}

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: true, allowBase64: false }),
      Placeholder.configure({ placeholder: 'Write something, or type "/" for commands...' }),
      SlashCommand.configure({
        onImageUpload: (file: File, ed?: any, pos?: number) => handleImagePipeline(file, ed, pos),
        suggestion: {
          items: ({ query }: { query: string }) => {
            return COMMANDS.filter((item) =>
              item.title.toLowerCase().startsWith(query.toLowerCase())
            )
          },
          render: renderItems,
        },
      }),
    ],
 
  })

  // Sync draft and published documents when context is ready
  useEffect(() => {
    if (authStatus === 'authenticated' && userContext) {
      fetchAvailableDrafts()
      fetchAvailablePublished(userContext)
    }
  }, [authStatus, userContext, fetchAvailableDrafts, fetchAvailablePublished])

  useEffect(() => {
    if (initialDraftId && editor) {
      loadExistingDraft(initialDraftId).then((htmlContent) => {
        if (htmlContent) {
          editor.commands.setContent(htmlContent)
        }
      })
    }
  }, [initialDraftId, editor, loadExistingDraft])

  

 const handleSelectDocument = async (id: string) => {
    if (!editor) return

    if (activeTab === 'published') {
      const htmlContent = await loadExistingPub(id)
      if (htmlContent) {
        editor.commands.setContent(htmlContent)
      }
    } else {
      const htmlContent = await loadExistingDraft(id)
      if (htmlContent) {
        editor.commands.setContent(htmlContent)
      }
    }
  }

  // Waiting on hydration or editor instance
  if (authStatus === 'unknown' || authStatus === 'loading' || !editor) {
    return <div className={styles.loadingState}>Loading editor...</div>
  }

  if (authStatus !== 'authenticated' || !userContext) {
    return null
  }

  return (
    <div className={styles.appLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <button
            type="button"
            className={styles.newDraftBtn}
            onClick={() => {
              setIsNewDocModalOpen(true)
              setActiveTab('editor')
            }}
          >
            + New Document
          </button>

          <nav className={styles.sidebarNav}>
            <button
              type="button"
              className={`${styles.navItem} ${activeTab === 'editor' ? styles.navActive : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              <span>Tabula</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${activeTab === 'drafts' ? styles.navActive : ''}`}
              onClick={() => {
                fetchAvailableDrafts()
                setActiveTab('drafts')
              }}
            >
              <span>Drafts</span>
              <span className={styles.navCount}>{availableDrafts.length}</span>
            </button>
            <button
              type="button"
              className={`${styles.navItem} ${activeTab === 'published' ? styles.navActive : ''}`}
              onClick={() => {
                if (userContext) fetchAvailablePublished(userContext)
                setActiveTab('published')
              }}
            >
              <span>Published</span>
              <span className={styles.navCount}>{availablePublished.length}</span>
            </button>
          </nav>
        </div>
      </aside>

      <main className={styles.mainCanvas}>
        {activeTab === 'editor' && (
          <EditorCanvas
            editor={editor}
            onOpenSaveModal={() => setIsSaveModalOpen(true)}
            onImageUpload={handleImagePipeline}
            isProcessingMedia={isProcessingMedia}
          />
        )}

        {activeTab === 'drafts' && (
          <DocumentListView
            title="Drafts"
            items={availableDrafts}
            onSelect={handleSelectDocument}
            emptyMessage="No draft documents yet."
          />
        )}

        {activeTab === 'published' && (
          <DocumentListView
            title="Published"
            items={availablePublished}
            onSelect={handleSelectDocument}
            emptyMessage="No published documents yet."
          />
        )}
      </main>

      <DraftFinderModal editor={editor} />
      <NewDocModal 
        isOpen={isNewDocModalOpen} 
        onClose={() => setIsNewDocModalOpen(false)} 
        editor={editor} 
      />
      <DraftSaveModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} editor={editor} />
    </div>
  )
}