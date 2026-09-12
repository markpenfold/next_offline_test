
// src/lib/draftStorage.ts
import { 
  saveToOPFSFolder, 
  readFromOPFSFolder, 
  getOPFSEntries, 
  getDirectory 
} from '@/components/data/diskOPFS'

export interface DraftData {
  metadata: DraftMetadata
  htmlContent: string
}
export type TemplateId = 'simple-blog' | 'newsprint' | 'split-screen' | 'super-clean'

export interface DraftMetadata {
  id: string
  userId: string
  accountId: string
  title: string
  customSlug: string
  templateId: TemplateId // Active visual layout selection
  createdAt: string
  updatedAt: string
  isSaved: boolean
  blobMap: Record<string, string>
}


/*===============================================================================
IMAGE PROCESSING 
===============================================================================*/

const MAX_BYTES = 500 * 1024; // 500 KB limit

async function processAndValidateImage(file: File): Promise<File> {
  // Step 1: Attempt lightweight client-side optimization to WebP
  const optimizedFile = await convertToWebP(file);

  // Step 2: Strict size enforcement check
  if (optimizedFile.size > MAX_BYTES) {
    const sizeInKB = Math.round(optimizedFile.size / 1024);
    throw new Error(
      `Image exceeds the 500 KB limit after optimization (${sizeInKB} KB). Please resize or crop the image.`
    );
  }

  return optimizedFile;
}

// Client-side WebP compressor preserving full resolution
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
LOAD AND STORE FROM OPFS
===============================================================================*/


// Saves or updates a draft with account and user isolation
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
      // File doesn't exist yet
    }

    await saveToOPFSFolder(dirPath, 'draft.json', JSON.stringify(currentMetadata, null, 2))
    await saveToOPFSFolder(dirPath, 'content.html', htmlContent)

    return true
  } catch (err) {
    console.error(`Failed to save draft [${draftId}]:`, err)
    return false
  }
}

/**
 * Lists local OPFS drafts filtered specifically by active user and account
 */
export async function listDrafts(userId: string, accountId: string): Promise<DraftMetadata[]> {
  const drafts: DraftMetadata[] = []

  try {
    const draftsFolder = await getDirectory('publishing/drafts')
    const dirIterable = draftsFolder as FileSystemDirectoryHandle & {
      values(): AsyncIterable<FileSystemHandle>
    }

    for await (const handle of dirIterable.values()) {
      if (handle.kind === 'directory') {
        const draftId = handle.name
        try {
          const rawMeta = await readFromOPFSFolder(`publishing/drafts/${draftId}`, 'draft.json', 'text')
          if (typeof rawMeta === 'string') {
            const meta: DraftMetadata = JSON.parse(rawMeta)
            // Filter strictly for active user & account
            if (meta.userId === userId && meta.accountId === accountId) {
              drafts.push(meta)
            }
          }
        } catch {
          // Skip corrupt or incomplete draft folders
        }
      }
    }
  } catch (err) {
    console.warn('Failed to list OPFS drafts:', err)
  }

  return drafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}



export async function loadDraft(draftId: string): Promise<DraftData | null> {
  try {
    const dirPath = `publishing/drafts/${draftId}`

    // 1. Read metadata & HTML content
    const rawMeta = (await readFromOPFSFolder(dirPath, 'draft.json', 'text')) as string
    let htmlContent = (await readFromOPFSFolder(dirPath, 'content.html', 'text')) as string
    const metadata: DraftMetadata = JSON.parse(rawMeta)

    // 2. Re-hydrate local OPFS images into active blob URLs
    const mediaEntries = await getOPFSEntries(`${dirPath}/media`)
    const updatedBlobMap: Record<string, string> = {}

    for (const { name, handle } of mediaEntries) {
      const file = await handle.getFile()
      const freshBlobUrl = URL.createObjectURL(file)
      
      // Store new mapping
      updatedBlobMap[freshBlobUrl] = name

      // Find old blob URLs matching this filename in the metadata map and replace them in HTML
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
