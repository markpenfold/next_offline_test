'use client'

import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { 
  Bold, 
  Italic, 
  Heading2, 
  List, 
  Quote, 
  Image as ImageIcon, 
  Loader2, 
  FolderOpen, 
  Save, 
  FilePlus,
  Send,
  ChevronDown
} from 'lucide-react'
import styles from '@/app/styles/editor.module.css'
import { convertToWebP } from './blogHelpers'
import { saveDraftMedia } from '@/components/data/diskOPFS'
import { useEditorStore } from '@/stores/useEditorStore'
import { TemplateId } from '@/components/blog/blogHelpers'
import { useAppStore } from '@/providers/AppStoreProvider'
import { TEMPLATE_OPTIONS } from './templates/TemplateOptions'

// Modal Imports
import { DraftSaveModal } from '@/components/helpers/DraftSaveModal'
import { DraftFinderModal } from '@/components/helpers/DraftFinderModal'


interface WritingToolProps {
  initialDraftId?: string
}

interface TemplateOption {
  id: TemplateId
  name: string
  diagram: React.ReactNode
}

export function WritingTool({ initialDraftId }: WritingToolProps) {
  const activeAccount = useAppStore((s) => s.activeAccount)
  const user = useAppStore((s) => s.userId)

  // Editor Store State & Actions
  const draftId = useEditorStore((s) => s.draftId)
  const title = useEditorStore((s) => s.title)
  const subTitle = useEditorStore((s) => s.subTitle)
  const templateId = useEditorStore((s) => s.templateId)
  const isSaving = useEditorStore((s) => s.isSaving)
  const isPublishing = useEditorStore((s) => s.isPublishing)
  
  const setTitle = useEditorStore((s) => s.setTitle)
  const setSubTitle = useEditorStore((s) => s.setSubTitle)
  const setTemplateId = useEditorStore((s) => s.setTemplateId)
  const registerBlob = useEditorStore((s) => s.registerBlob)
  const setIsDrawerOpen = useEditorStore((s) => s.setIsDrawerOpen)
  const initializeNewDraft = useEditorStore((s) => s.initializeNewDraft)
  const loadExistingDraft = useEditorStore((s) => s.loadExistingDraft)
  const publishDraft = useEditorStore((s) => s.publishDraft)

  // Modal Visibility States
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)

  const [isProcessingMedia, setIsProcessingMedia] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  
  // Menu Popover State & Ref
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image.configure({
        inline: true,
        allowBase64: false,
      }),
    ],
    editorProps: {
      handleDrop(view, event, slice, moved) {
        if (!moved && event.dataTransfer?.files?.length) {
          const file = event.dataTransfer.files[0]
          if (file.type.startsWith('image/')) {
            event.preventDefault()
            handleImagePipeline(file)
            return true
          }
        }
        return false
      },
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items || [])
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (file) handleImagePipeline(file)
            return true
          }
        }
        return false
      },
    },
  })

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
    setEditorError(null)
    setIsProcessingMedia(true)

    try {
      const processedFile = await convertToWebP(rawFile)

      if (processedFile.size > 500 * 1024) {
        const sizeKB = Math.round(processedFile.size / 1024)
        throw new Error(`File is ${sizeKB} KB. Limit is 500 KB after WebP optimization.`)
      }

      const fileExt = processedFile.name.split('.').pop() || 'webp'
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`

      await saveDraftMedia(draftId, fileName, processedFile)
      const localBlobUrl = URL.createObjectURL(processedFile)

      registerBlob(localBlobUrl, fileName)
      editor?.chain().focus().setImage({ src: localBlobUrl }).run()
    } catch (err: any) {
      setEditorError(err.message || 'Failed to process image locally')
    } finally {
      setIsProcessingMedia(false)
    }
  }

  const handlePublish = async () => {
    if (!user || !activeAccount?.id || !activeAccount?.name || !editor) {
      setEditorError('Account session missing. Cannot publish.')
      return
    }

    const accountSlug = activeAccount.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')

    const res = await publishDraft(
      { userId: user, accountId: activeAccount.id, accountSlug },
      editor.getHTML()
    )

    if (!res.success) {
      setEditorError(res.error || 'Failed to publish draft.')
    } else {
      editor.commands.clearContent()
    }
  }

  const handleNew = () => {
    initializeNewDraft()
    editor?.commands.clearContent()
  }

  const getCanvasLayoutClass = () => {
    switch (templateId) {
      case 'newsprint':
        return `${styles.canvasNewsprint} pinkNewsprint`
      case 'split-screen':
        return styles.canvasSplitScreen
      case 'super-clean':
        return styles.canvasSuperClean
      case 'simple-blog':
      default:
        return styles.canvasSimpleBlog
    }
  }

  const activeTemplate = TEMPLATE_OPTIONS.find((t) => t.id === templateId) || TEMPLATE_OPTIONS[0]

  if (!editor) return null

  return (
    <div className={styles.editorContainer}>
      {/* Header Bar */}
      <header className={styles.editorHeader}>
        <div className={styles.headerLeft}>
          <button 
            type="button" 
            onClick={handleNew} 
            className={styles.actionBtn}
            title="New Draft"
          >
            <FilePlus size={16} />
            <span>New</span>
          </button>

          {/* OPEN BUTTON -> Triggers DraftFinderModal via Zustand */}
          <button 
            type="button" 
            onClick={() => setIsDrawerOpen(true)} 
            className={styles.actionBtn}
            title="Open Drafts"
          >
            <FolderOpen size={16} />
            <span>Open</span>
          </button>

          {/* Template Visual Selector */}
          <div className={styles.templateDropdownContainer} ref={dropdownRef}>
            <button
              type="button"
              className={styles.templateTriggerBtn}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <div className={styles.triggerDiagramWrapper}>
                {activeTemplate.diagram}
              </div>
              <span className={styles.triggerLabel}>{activeTemplate.name}</span>
              <ChevronDown size={14} className={styles.chevronIcon} />
            </button>

            {isMenuOpen && (
              <div className={styles.templateMenuPopover}>
                <div className={styles.popoverHeader}>Select Layout</div>
                <div className={styles.popoverGrid}>
                  {TEMPLATE_OPTIONS.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      className={`${styles.menuOptionBtn} ${
                        templateId === tmpl.id ? styles.menuOptionActive : ''
                      }`}
                      onClick={() => {
                        setTemplateId(tmpl.id)
                        setIsMenuOpen(false)
                      }}
                    >
                      <div className={styles.optionDiagramWrapper}>{tmpl.diagram}</div>
                      <span className={styles.optionName}>{tmpl.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* SAVE BUTTON -> Triggers DraftSaveModal */}
          <button 
            type="button" 
            onClick={() => setIsSaveModalOpen(true)} 
            disabled={isSaving}
            className={styles.actionBtn}
          >
            {isSaving ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
            <span>Save</span>
          </button>

          <button 
            type="button" 
            onClick={handlePublish} 
            disabled={isPublishing}
            className={`${styles.actionBtn} ${styles.saveBtn}`}
          >
            {isPublishing ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />}
            <span>Publish</span>
          </button>
        </div>
      </header>

      {/* Formatting Toolbar */}
      <div className={styles.editorToolbar}>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`${styles.toolBtn} ${editor.isActive('bold') ? styles.toolBtnActive : ''}`}
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`${styles.toolBtn} ${editor.isActive('italic') ? styles.toolBtnActive : ''}`}
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`${styles.toolBtn} ${editor.isActive('heading', { level: 2 }) ? styles.toolBtnActive : ''}`}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`${styles.toolBtn} ${editor.isActive('bulletList') ? styles.toolBtnActive : ''}`}
          title="Bullet List"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`${styles.toolBtn} ${editor.isActive('blockquote') ? styles.toolBtnActive : ''}`}
          title="Quote"
        >
          <Quote size={16} />
        </button>

        <span className={styles.toolbarDivider} />

        <label className={styles.toolBtn} title="Insert Image">
          {isProcessingMedia ? <Loader2 size={16} className={styles.spin} /> : <ImageIcon size={16} />}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            disabled={isProcessingMedia}
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleImagePipeline(e.target.files[0])
                e.target.value = ''
              }
            }}
          />
        </label>
      </div>

      {editorError && <div className={styles.editorErrorNotice}>{editorError}</div>}

      {/* Canvas Area */}
      <div className={styles.canvasContainer}>
        <div className={`${styles.canvasFrame} ${getCanvasLayoutClass()}`}>
          <div className={styles.titleWrapper}>
            <input
              type="text"
              placeholder="Post title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={styles.titleInput}
            />
          </div>
          <div className={styles.titleWrapper}>
            <input
              type="text"
              placeholder="Post subtitle..."
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              className={styles.subTitleInput}
            />
          </div>

          <EditorContent editor={editor} className={styles.editorCanvas} />
        </div>
      </div>

      {/* Save & Open Draft Modals */}
      <DraftFinderModal editor={editor} />
      <DraftSaveModal 
        isOpen={isSaveModalOpen} 
        onClose={() => setIsSaveModalOpen(false)} 
        editor={editor} 
      />
    </div>
  )
}