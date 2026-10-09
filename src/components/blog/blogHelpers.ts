// src/lib/blogHelpers.ts

/*===============================================================================
TYPES & INTERFACES
===============================================================================*/
// Example Publisher Pipeline Step


export type TemplateId = 'simple-blog' | 'newsprint' | 'split-screen' | 'super-clean'

export type PostStatus = 'draft' | 'published'

export interface UserContext {
  userId: string
  accountId: string
  accountSlug?: string
  name: string
}

export interface AuthorContext {
  userId: string
  accountId: string
  accountSlug?: string
  name: string
}

export interface BlogPost {
  id: string                   // Unique UUID (never changes)
  slug: string                 // URL slug (editable)
  title: string
  subTitle?: string | null
  content?: string             // HTML markup string
  status: PostStatus
  createdAt: string
  dateLastEdited: string
  author: AuthorContext
  templateId?: TemplateId | string
  blobMap?: Record<string, string>
  dirHandle: FileSystemDirectoryHandle | null
  heroImage?: string | null
}

export interface ManifestPost {
  id: string                   // Matches local BlogPost.id
  postSlug: string             // R2 folder slug
  title: string
  publishedAt: string
  updatedAt: string
  subTitle?: string | null
  heroImage?: string | null
}

/*===============================================================================
DIRECTORY HELPERS
===============================================================================*/

/** Recursively fetches or creates an OPFS directory handle for a given path */
export async function getDirectory(dirName: string): Promise<FileSystemDirectoryHandle> {
  let currentHandle = await navigator.storage.getDirectory()
  const segments = dirName.split('/').filter((s) => s.length > 0)

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true })
  }

  return currentHandle
}

/*===============================================================================
OPFS READ & WRITE HELPERS
===============================================================================*/

/*===============================================================================
IMAGE PROCESSING
===============================================================================*/

interface ImageCompressOptions {
  maxWidth?: number     // Max width threshold (default: 1000px)
  maxSizeBytes?: number // Quality cap limit (default: 1MB)
  initialQuality?: number
}

/** Client-side WebP compressor with automatic canvas downscaling and size limit enforcement */
export function convertToWebP(
  file: File, 
  options: ImageCompressOptions = {}
): Promise<File> {
  const {
    maxWidth = 1000,
    maxSizeBytes = 1 * 1024 * 1024,
    initialQuality = 0.82,
  } = options

  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.src = URL.createObjectURL(file)

    img.onload = async () => {
      URL.revokeObjectURL(img.src)

      let width = img.width
      let height = img.height

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas setup failed'))

      ctx.drawImage(img, 0, 0, width, height)

      const getBlob = (quality: number): Promise<Blob | null> => {
        return new Promise((res) => canvas.toBlob(res, 'image/webp', quality))
      }

      try {
        let currentQuality = initialQuality
        let blob = await getBlob(currentQuality)

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

export interface Contributor {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
}

export interface PostCardData {
  slug: string;
  title: string;
  subtitle?: string | null;
  heroImage?: string | null;
  publishedAt: string;
  readingTime?: string | null;
}

export interface IndexPageParams {
  accountSlug: string;
  blogTitle: string;
  blogSubtitle?: string | null;
  blogHeaderImage?: string | null;
  contributors: Contributor[];
  initialPosts?: PostCardData[];
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}