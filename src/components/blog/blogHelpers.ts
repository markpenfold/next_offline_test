// src/lib/blogHelpers.ts
import { 
  saveToOPFSFolder, 
  readFromOPFSFolder, 
  getOPFSEntries 
} from '@/components/data/diskOPFS'

/*===============================================================================
TYPES & INTERFACES
===============================================================================*/

export type TemplateId = 'simple-blog' | 'newsprint' | 'split-screen' | 'super-clean'

export interface DraftMetadata {
  id: string
  userId: string
  accountId: string
  title: string
  subTitle: string | null
  customSlug: string
  templateId: TemplateId
  createdAt: string
  updatedAt: string
  isSaved: boolean
  blobMap: Record<string, string>
}

export interface DraftData {
  metadata: DraftMetadata
  htmlContent: string
}

/*===============================================================================
IMAGE PROCESSING
===============================================================================*/

/** Client-side WebP compressor preserving full resolution */
export function convertToWebP(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.src = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(img.src)
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height

      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas setup failed'))

      ctx.drawImage(img, 0, 0)

      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file)
          const webpName = file.name.replace(/\.[^/.]+$/, '') + '.webp'
          resolve(new File([blob], webpName, { type: 'image/webp' }))
        },
        'image/webp',
        0.82
      )
    }

    img.onerror = () => reject(new Error('Failed to parse image file'))
  })
}

/*===============================================================================
OPFS READ & WRITE HELPERS
===============================================================================*/

/** Saves or updates a draft in OPFS with account and user context */
export async function saveDraft(
  draftId: string, 
  userContext: { userId: string; accountId: string },
  metadata: Partial<DraftMetadata>, 
  htmlContent: string
): Promise<boolean> {
  try {
    const dirPath = `publishing/drafts/${draftId}`

    let currentMetadata: DraftMetadata = {
      id: draftId,
      userId: userContext.userId,
      accountId: userContext.accountId,
      title: 'Untitled Draft',
      subTitle: null,
      customSlug: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isSaved: false,
      blobMap: {},
      templateId: 'simple-blog',
      ...metadata,
    }

    try {
      const rawMeta = await readFromOPFSFolder(dirPath, 'draft.json', 'text')
      if (typeof rawMeta === 'string') {
        currentMetadata = { 
          ...JSON.parse(rawMeta), 
          ...metadata, 
          userId: userContext.userId,
          accountId: userContext.accountId,
          updatedAt: new Date().toISOString() 
        }
      }
    } catch {
      // New file creation path
    }

    await saveToOPFSFolder(dirPath, 'draft.json', JSON.stringify(currentMetadata, null, 2))
    await saveToOPFSFolder(dirPath, 'content.html', htmlContent)

    return true
  } catch (err) {
    console.error(`Failed to save draft [${draftId}]:`, err)
    return false
  }
}

/** Reads a draft folder from OPFS and re-hydrates binary media blobs for Tiptap */
export async function loadDraft(draftId: string): Promise<DraftData | null> {
  try {
    const dirPath = `publishing/drafts/${draftId}`

    // 1. Read metadata & HTML content
    const rawMeta = (await readFromOPFSFolder(dirPath, 'draft.json', 'text')) as string
    let htmlContent = (await readFromOPFSFolder(dirPath, 'content.html', 'text')) as string
    const metadata: DraftMetadata = JSON.parse(rawMeta)

    // 2. Re-hydrate local OPFS media files into fresh browser blob URLs
    const mediaEntries = await getOPFSEntries(`${dirPath}/media`)
    const updatedBlobMap: Record<string, string> = {}

    for (const { name, handle } of mediaEntries) {
      const file = await handle.getFile()
      const freshBlobUrl = URL.createObjectURL(file)
      
      updatedBlobMap[freshBlobUrl] = name

      const oldBlobUrl = Object.keys(metadata.blobMap || {}).find(
        (key) => metadata.blobMap[key] === name
      )

      if (oldBlobUrl) {
        htmlContent = htmlContent.replaceAll(oldBlobUrl, freshBlobUrl)
      }
    }

    metadata.blobMap = updatedBlobMap

    return { metadata, htmlContent }
  } catch (err) {
    console.error(`Failed to load draft [${draftId}]:`, err)
    return null
  }
}