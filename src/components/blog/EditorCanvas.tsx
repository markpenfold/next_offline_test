'use client'

import React, { useState, useRef, useEffect } from 'react'
import { EditorContent, Editor } from '@tiptap/react'
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon,
  Heading2, 
  Heading3,
  Heading4,
  List, 
  ListOrdered,
  Quote, 
  Image as ImageIcon, 
  Loader2, 
  Save, 
  Send, 
  ChevronDown,
  PenTool,
  Highlighter,
  X,
  Upload
} from 'lucide-react'
import styles from '@/app/styles/editor.module.css'
import { useEditorStore } from '@/stores/useEditorStore'
import { useAppStore } from '@/providers/AppStoreProvider'
import { TEMPLATE_OPTIONS } from './templates/TemplateOptions'
import type {} from '@tiptap/extension-highlight'

interface EditorCanvasProps {
  editor: Editor
  onOpenSaveModal: () => void
  onImageUpload: (file: File) => void
  isProcessingMedia: boolean
}

export function EditorCanvas({
  editor,
  onOpenSaveModal,
  onImageUpload,
  isProcessingMedia,
}: EditorCanvasProps) {
  const activeAccount = useAppStore((s) => s.activeAccount)
  const user = useAppStore((s) => s.userId)

  const title = useEditorStore((s) => s.title)
  const subTitle = useEditorStore((s) => s.subTitle)
  const templateId = useEditorStore((s) => s.templateId)
  const isSaving = useEditorStore((s) => s.isSaving)
  const isPublishing = useEditorStore((s) => s.isPublishing)
  const showToolbar = useEditorStore((s) => s.showToolbar)

  const setTitle = useEditorStore((s) => s.setTitle)
  const setSubTitle = useEditorStore((s) => s.setSubTitle)
  const setTemplateId = useEditorStore((s) => s.setTemplateId)
  const toggleToolbar = useEditorStore((s) => s.toggleToolbar)
  const publishDraft = useEditorStore((s) => s.publishDraft)

  const [heroImage, setHeroImage] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
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

  const activeTemplate = TEMPLATE_OPTIONS.find((t) => t.id === templateId) || TEMPLATE_OPTIONS[0]

  const handleHeroSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.onload = () => setHeroImage(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handlePublish = async () => {
  setEditorError(null)

  if (!user || !activeAccount?.id || !activeAccount?.account_slug) {
    setEditorError('Account session or user information is missing.')
    return
  }

  let accountSlug = activeAccount.account_slug
    

  if(!accountSlug){
    accountSlug = activeAccount.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
  }

  const res = await publishDraft(
    {
      userId: user,
      accountId: activeAccount.id,
      accountSlug,
    },
    editor.getHTML()
  )

  if (!res.success) {
    setEditorError(res.error || 'Failed to publish draft.')
  }
}

  return (
    <div className={styles.canvasWrapper}>
      {/* Header Bar */}
      <header className={styles.editorHeader}>
        <div className={styles.headerLeft}>
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
              <ChevronDown size={14} />
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

        <div className={styles.headerRight} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={toggleToolbar}
            className={`${styles.actionBtn} ${showToolbar ? styles.toolBtnActive : ''}`}
            title="Toggle Toolbar"
          >
            <PenTool size={16} />
          </button>

          <button 
            type="button" 
            onClick={onOpenSaveModal} 
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
            className={`${styles.actionBtn} ${styles.publishBtn}`}
            >
            {isPublishing ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />}
            <span>Publish</span>
            </button>
        </div>
      </header>

      {/* Formatting Toolbar */}
      {showToolbar && (
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
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`${styles.toolBtn} ${editor.isActive('underline') ? styles.toolBtnActive : ''}`}
            title="Underline"
          >
            <UnderlineIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
            className={`${styles.toolBtn} ${editor.isActive('highlight') ? styles.toolBtnActive : ''}`}
            title="Highlight Text"
          >
            <Highlighter size={16} />
          </button>

          <span className={styles.toolbarDivider} />

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
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`${styles.toolBtn} ${editor.isActive('heading', { level: 3 }) ? styles.toolBtnActive : ''}`}
            title="Heading 3"
          >
            <Heading3 size={16} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            className={`${styles.toolBtn} ${editor.isActive('heading', { level: 4 }) ? styles.toolBtnActive : ''}`}
            title="Heading 4"
          >
            <Heading4 size={16} />
          </button>

          <span className={styles.toolbarDivider} />

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
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`${styles.toolBtn} ${editor.isActive('orderedList') ? styles.toolBtnActive : ''}`}
            title="Numbered List"
          >
            <ListOrdered size={16} />
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
                  onImageUpload(e.target.files[0])
                  e.target.value = ''
                }
              }}
            />
          </label>
        </div>
      )}

      {editorError && <div className={styles.editorErrorNotice}>{editorError}</div>}

      {/* Document Sheet */}
      <div className={styles.editorContainer}>
        <div className={styles.canvasFrame}>
          
          {/* HERO SLOT ABOVE TITLE */}
          <div className={styles.heroSlot}>
            {heroImage ? (
              <div className={styles.heroWrapper}>
                <img src={heroImage} alt="Hero Banner" className={styles.heroImage} />
                <button
                  type="button"
                  className={styles.removeHeroBtn}
                  onClick={() => setHeroImage(null)}
                  title="Remove Hero Image"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className={styles.heroPlaceholder}>
                <Upload size={16} />
                <span>Add Hero Cover (or type / image below)</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleHeroSelect}
                />
              </label>
            )}
          </div>

          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={styles.titleInput}
          />
          <input
            type="text"
            placeholder="Subtitle (optional)"
            value={subTitle}
            onChange={(e) => setSubTitle(e.target.value)}
            className={styles.subTitleInput}
          />

          <div 
            className={styles.canvasContainer}
            onClick={() => editor.commands.focus()}
          >
            <EditorContent editor={editor} className={styles.editorCanvas} />
          </div>
        </div>
      </div>
    </div>
  )
}