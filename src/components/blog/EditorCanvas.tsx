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
  Toolbox,
  Highlighter,
  X,
  Upload
} from 'lucide-react'
import styles from '@/app/styles/editor.module.css'
import { useEditorStore } from '@/stores/useEditorStore'
import { useAppStore } from '@/providers/AppStoreProvider'
import { TEMPLATE_OPTIONS } from './templates/TemplateOptions'
import type {} from '@tiptap/extension-highlight'
import { getOPFSPostById } from '../data/diskOPFS'

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
  const profile = useAppStore((s) => s.profile)

  const draftId = useEditorStore((s) => s.draftId)
  const title = useEditorStore((s) => s.liveTitle)
  const subTitle = useEditorStore((s) => s.liveSubTitle)
  const customSlug = useEditorStore((s) => s.customSlug)
  const templateId = useEditorStore((s) => s.templateId)
  const isSaving = useEditorStore((s) => s.isSaving)
  const isPublishing = useEditorStore((s) => s.isPublishing)
  const isUnpublishing = useEditorStore((s) => s.isUnpublishing)
  const showToolbar = useEditorStore((s) => s.showToolbar)
  const currentPost = useEditorStore((s) => s.currentPost)
  

  const setTitle = useEditorStore((s) => s.setLiveTitle)
  const setSubTitle = useEditorStore((s) => s.setLiveSubTitle)
  const setTemplateId = useEditorStore((s) => s.setTemplateId)
  const toggleToolbar = useEditorStore((s) => s.toggleToolbar)
  const publishDraft = useEditorStore((s) => s.publishDraft)
  const unpublishPost = useEditorStore((s) => s.unpublishPost)
  const saveCurrentDraft = useEditorStore((s) => s.saveCurrentDraft)
  const setCurrentPost = useEditorStore((s) => s.setCurrentPost)

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

    if (!user || !activeAccount?.id || !profile) {
      setEditorError('Account session or user information is missing.')
      return
    }

    let accountSlug = activeAccount.account_slug
    if (!accountSlug && activeAccount.name) {
      accountSlug = activeAccount.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
    }

    if (!accountSlug) {
      setEditorError('A valid account slug could not be determined.')
      return
    }

    const userContext = {
      userId: user,
      accountId: activeAccount.id,
      accountSlug,
      name: profile.display_name || activeAccount.name || `${activeAccount.account_slug || 'Author'} Author`,
    }

    const currentHtml = editor ? editor.getHTML() : ''

    try {
      // 1. Force-save unpersisted content to local OPFS draft & get the exact saved draft ID
      const savedDraft = await saveCurrentDraft(userContext, currentHtml)
      if (!savedDraft) {
        setEditorError('Failed to save draft before publishing.')
        return
      }

      // 2. Publish to R2 (which internally calls moveDraftToPublished using savedDraftId)
      const res = await publishDraft(userContext, currentHtml)

      if (res.success) {
        // 3. Fetch the accurate, updated post directly from OPFS published folder
        const publishedPost = await getOPFSPostById('publishing/published', savedDraft.id)

        if (publishedPost) {
          console.log("in the published folder now: ", publishedPost)
          setCurrentPost({
            ...publishedPost,
            content: currentHtml, // Attach active editor HTML content
          })
        } else {
          // Fallback in case directory read fails
          setCurrentPost({
            id: savedDraft.id,
            slug: res.postSlug || customSlug || savedDraft.id,
            title: title || 'Untitled',
            subTitle: subTitle || null,
            content: currentHtml,
            createdAt: currentPost?.createdAt || new Date().toISOString(),
            dateLastEdited: new Date().toISOString(),
            status: 'published',
            author: {
              userId: user,
              accountId: activeAccount.id,
              accountSlug,
              name: profile.display_name || activeAccount.name || 'Author',
            },
            dirHandle: null,
          })
        }
      } else {
        setEditorError(res.error || 'Failed to publish draft.')
      }
    } catch (err: any) {
      console.error('Error during pre-publish save or publish execution:', err)
      setEditorError(err.message || 'An unexpected error occurred while publishing.')
    }
  }



  const handleUnPublish = async () => {
    setEditorError(null)

    if (!user || !activeAccount?.id) {
      setEditorError('Account session or user information is missing.')
      return
    }

    let accountSlug = activeAccount.account_slug
    if (!accountSlug && activeAccount.name) {
      accountSlug = activeAccount.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
    }

    const targetPostId = currentPost?.id || draftId
    const targetPostSlug = currentPost?.slug || customSlug.trim() || title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')

    const res = await unpublishPost(
      {
        userId: user,
        accountId: activeAccount.id,
        accountSlug,
        name: profile?.display_name || activeAccount.name || activeAccount.account_slug+' Author',
      },
      targetPostId,
      targetPostSlug
    )

    if (!res.success) {
      setEditorError(res.error || 'Failed to unpublish post.')
    }
  }

  return (
    <div className={styles.canvasWrapper}>
      {/* Header Bar */}
      <header className={styles.editorHeader}>
        <div className={styles.headerLeft}>

          <button 
            type="button" 
            onClick={onOpenSaveModal} 
            disabled={isSaving}
            className={styles.actionBtn}>
            {isSaving ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
            <span>Save</span>
          </button>

          <button
            type="button" 
            onClick={handlePublish}
            disabled={isPublishing}
            className={`${styles.actionBtn} ${styles.publishBtn}`}>
            {isPublishing ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />}
            <span>Publish to {activeAccount?.account_slug}</span>
          </button>

          {currentPost?.status === 'published' && (
            <div>
              <div>THIS POST IS LIVE</div>
              <button
                type="button" 
                onClick={handleUnPublish}
                disabled={isUnpublishing}
                className={`${styles.actionBtn} ${styles.publishBtn}`}>
                {isUnpublishing ? <Loader2 size={16} className={styles.spin} /> : <Send size={16} />}
                <span>Unpublish from {activeAccount?.account_slug}</span>
              </button>
            </div>
          )}
        </div>

        <div className={styles.headerRight} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        </div>
      </header>

      {/* Formatting Toolbar */}
  
        <div className={styles.editorToolbar}>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`${styles.toolBtn} ${editor.isActive('bold') ? styles.toolBtnActive : ''}`}
            title="Bold">
            <Bold size={16} />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`${styles.toolBtn} ${editor.isActive('italic') ? styles.toolBtnActive : ''}`}
            title="Italic">
            <Italic size={16} />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`${styles.toolBtn} ${editor.isActive('underline') ? styles.toolBtnActive : ''}`}
            title="Underline">
            <UnderlineIcon size={16} />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
            className={`${styles.toolBtn} ${editor.isActive('highlight') ? styles.toolBtnActive : ''}`}
            title="Highlight Text">
            <Highlighter size={16} />
          </button>

          <span className={styles.toolbarDivider} />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`${styles.toolBtn} ${editor.isActive('heading', { level: 2 }) ? styles.toolBtnActive : ''}`}
            title="Heading 2">
            <Heading2 size={16} />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`${styles.toolBtn} ${editor.isActive('heading', { level: 3 }) ? styles.toolBtnActive : ''}`}
            title="Heading 3">
            <Heading3 size={16} />
          </button>
          
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            className={`${styles.toolBtn} ${editor.isActive('heading', { level: 4 }) ? styles.toolBtnActive : ''}`}
            title="Heading 4">
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
          <span className={styles.toolbarDivider} />
          
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
          <span className={styles.toolbarDivider} />
        </div>
     

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