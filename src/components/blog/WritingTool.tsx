'use client'

import { useState, useEffect } from 'react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'

import { DocumentListView } from './DocumentListView'
import { EditorCanvas } from './EditorCanvas'

import styles from '@/app/styles/editor.module.css'
import { convertToWebP } from './blogHelpers'
import { saveDraftMedia } from '@/components/data/diskOPFS'
import { useEditorStore } from '@/stores/useEditorStore'
import { useAppStore } from '@/providers/AppStoreProvider'

import { DraftSaveModal } from '@/components/helpers/DraftSaveModal'
import { DraftFinderModal } from '@/components/helpers/DraftFinderModal'

import { SlashCommand, COMMANDS, renderItems } from './SlashCommand'

import { Highlight } from '@tiptap/extension-highlight'
export function WritingTool({ initialDraftId }: { initialDraftId?: string }) {
  const activeAccount = useAppStore((s) => s.activeAccount)

  const draftId = useEditorStore((s) => s.draftId)
  const availableDrafts = useEditorStore((s) => s.availableDrafts)
  const availablePublished = useEditorStore((s) => s.availablePublished)
  const activeTab = useEditorStore((s) => s.activeTab)
  
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const registerBlob = useEditorStore((s) => s.registerBlob)
  const initializeNewDraft = useEditorStore((s) => s.initializeNewDraft)
  const loadExistingDraft = useEditorStore((s) => s.loadExistingDraft)
  const fetchAvailableDrafts = useEditorStore((s) => s.fetchAvailableDrafts)
  const fetchAvailablePublished = useEditorStore((s) => s.fetchAvailablePublished)

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [isProcessingMedia, setIsProcessingMedia] = useState(false)

  const editor = useEditor({
  immediatelyRender: false,
  extensions: [
    StarterKit,
    Highlight.configure({ multicolor: true }),
    
    Image.configure({ inline: true, allowBase64: false }),
    Placeholder.configure({ placeholder: 'Write something, or type "/" for commands...' }),
    SlashCommand.configure({
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

  useEffect(() => {
    fetchAvailableDrafts()
    fetchAvailablePublished()
  }, [fetchAvailableDrafts, fetchAvailablePublished])

  useEffect(() => {
    if (initialDraftId && editor) {
      loadExistingDraft(initialDraftId).then((htmlContent) => {
        if (htmlContent) {
          editor.commands.setContent(htmlContent)
        }
      })
    }
  }, [initialDraftId, editor, loadExistingDraft])

  const handleImagePipeline = async (rawFile: File) => {
    setIsProcessingMedia(true)
    try {
      const processedFile = await convertToWebP(rawFile)
      const fileName = `${Date.now()}-img.webp`
      await saveDraftMedia(draftId, fileName, processedFile)
      const localBlobUrl = URL.createObjectURL(processedFile)
      registerBlob(localBlobUrl, fileName)
      editor?.chain().focus().setImage({ src: localBlobUrl }).run()
    } finally {
      setIsProcessingMedia(false)
    }
  }

  const handleSelectDocument = async (slug: string) => {
    if (!editor) return
    const htmlContent = await loadExistingDraft(slug)
    if (htmlContent) {
      editor.commands.setContent(htmlContent)
    }
  }

  if (!editor) return null

  return (
    <div className={styles.appLayout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.workspaceHeader}>
            <div className={styles.workspaceAvatar}>W</div>
            <span>Writer</span>
          </div>

          <button
            type="button"
            className={styles.newDraftBtn}
            onClick={() => {
              initializeNewDraft()
              editor.commands.clearContent()
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
              <span>Canvas</span>
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
                fetchAvailablePublished()
                setActiveTab('published')
              }}
            >
              <span>Published</span>
              <span className={styles.navCount}>{availablePublished.length}</span>
            </button>
          </nav>
        </div>

        <div className={styles.sidebarUser}>
          <div className={styles.userAvatar}>U</div>
          <span className={styles.userName}>{activeAccount?.name || 'Account'}</span>
        </div>
      </aside>

      {/* Main Workspace */}
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
      <DraftSaveModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} editor={editor} />
    </div>
  )
}