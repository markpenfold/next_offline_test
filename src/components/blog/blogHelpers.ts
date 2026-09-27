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
export function convertToWebPx(file: File): Promise<File> {
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

/*===============================================================================
IMAGE PROCESSING
===============================================================================*/

interface ImageCompressOptions {
  maxWidth?: number    // Matches layout max-width (e.g., 1000px)
  maxSizeBytes?: number // e.g., 1MB (1024 * 1024 bytes)
  initialQuality?: number
}

/** Client-side WebP compressor with automatic canvas downscaling and MB limit enforcement */
export function convertToWebP(
  file: File, 
  options: ImageCompressOptions = {}
): Promise<File> {
  const {
    maxWidth = 1000,
    maxSizeBytes = 1 * 1024 * 1024, // 1 MB limit
    initialQuality = 0.82,
  } = options

  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.src = URL.createObjectURL(file)

    img.onload = async () => {
      URL.revokeObjectURL(img.src)

      // 1. Calculate resized dimensions while preserving aspect ratio
      let width = img.width
      let height = img.height

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      // 2. Render to Offscreen Canvas
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas setup failed'))

      ctx.drawImage(img, 0, 0, width, height)

      // 3. Helper function to serialize canvas into a blob
      const getBlob = (quality: number): Promise<Blob | null> => {
        return new Promise((res) => canvas.toBlob(res, 'image/webp', quality))
      }

      try {
        let currentQuality = initialQuality
        let blob = await getBlob(currentQuality)

        // 4. Iteratively decrease quality if compressed file still exceeds maxSizeBytes
        while (blob && blob.size > maxSizeBytes && currentQuality > 0.2) {
          currentQuality -= 0.12
          blob = await getBlob(currentQuality)
        }

        if (!blob) return resolve(file)

        const webpName = file.name.replace(/\.[^/.]+$/, '') + '.webp'
        resolve(new File([blob], webpName, { type: 'image/webp' }))
      } catch (err) {
        reject(err)
      }
    }

    img.onerror = () => reject(new Error('Failed to parse image file'))
  })
}