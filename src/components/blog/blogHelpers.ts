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
  accountSlug: string
  name: string
}

export interface AuthorContext {
  userId: string
  accountId: string
  accountSlug: string
  name: string
}

// content of the post.json file in each draft folder
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


/*===============================================================================
HANDLE UPDATES TO POST.JSON
===============================================================================*/

/** Reads and parses post.json from a local OPFS post directory. */
export async function readLocalPostJson(subDirHandle: FileSystemDirectoryHandle): Promise<any> {
  try {
    const fileHandle = await subDirHandle.getFileHandle('post.json');
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (err) {
    console.warn('Could not read post.json from OPFS directory, returning empty object:', err);
    return false;
  }
}


/**
 * Serializes and writes metadata to post.json inside a local OPFS post directory.
 * Returns true if successful, false otherwise.
 */
export async function writeLocalPostJson(
  subDirHandle: FileSystemDirectoryHandle, 
  metadata: any
): Promise<boolean> {
  try {
    const fileHandle = await subDirHandle.getFileHandle('post.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(metadata, null, 2));
    await writable.close();
    return true;
  } catch (err) {
    console.error('Failed to write post.json to OPFS directory:', err);
    return false;
  }
}

/**
 * Reads existing post.json from OPFS, merges partial updates, updates the timestamp, and writes it back.
 * Returns the updated metadata object on success, or throws/returns null on failure.
 */
export async function updatePostJson(
  postId: string,
  updates: Record<string, any>
): Promise<any | null> {
  try {
    const dirPath = `publishing/${postId}`;
    const localDirHandle = await getDirectory(dirPath);
    
    // Read existing metadata
    const existingMetadata = await readLocalPostJson(localDirHandle);
    
    // Merge updates and stamp with current time
    const updatedMetadata = {
      ...existingMetadata,
      ...updates,
      dateLastEdited: new Date().toISOString(),
    };
    
    // Write back to OPFS and check success status
    const success = await writeLocalPostJson(localDirHandle, updatedMetadata);
    if (!success) {
      throw new Error(`Failed to write updated post.json for post ${postId}`);
    }
    
    return updatedMetadata;
  } catch (err) {
    console.error('Failed in updatePostJson:', err);
    return null;
  }
}



export function convertJsonToBlogPost(
  metadata: any, 
  dirHandle: FileSystemDirectoryHandle, 
  fallbackLastModified?: string
): BlogPost {
  const fileLastModified = fallbackLastModified || new Date().toISOString()
  const postStatus = metadata.status || 'draft'

  return {
    id: metadata.id || dirHandle.name,
    slug: metadata.slug || metadata.customSlug || metadata.postSlug || dirHandle.name,
    title: metadata.title || 'Untitled Post',
    subTitle: metadata.subTitle || null,
    status: postStatus,
    createdAt: metadata.createdAt || metadata.publishedAt || fileLastModified,
    dateLastEdited: metadata.dateLastEdited || metadata.updatedAt || fileLastModified,
    author: {
      userId: metadata.author?.userId || metadata.userId || '',
      accountId: metadata.author?.accountId || metadata.accountId || '',
      accountSlug: metadata.author?.accountSlug || metadata.accountSlug || '',
      name: metadata.author?.name || metadata.accountSlug || 'Author',
    },
    blobMap: metadata.blobMap || {},
    templateId: metadata.templateId || 'simple-blog',
    dirHandle: dirHandle,
    heroImage: metadata.heroImage || null,
  }
}



/**
 * Inspects downloaded media filenames and index.html content, 
 * builds a working blobMap, and rewrites image URLs to point to local OPFS paths.
 */
export function generateBlobMapAndFixHtml(
  htmlContent: string,
  mediaFilenames: string[]
): { blobMap: Record<string, string>; updatedHtml: string } {
  const blobMap: Record<string, string> = {}
  let updatedHtml = htmlContent

  if (!mediaFilenames || mediaFilenames.length === 0) {
    return { blobMap, updatedHtml }
  }

  for (const filename of mediaFilenames) {
    const localPath = `media/${filename}`
    blobMap[filename] = localPath
    blobMap[localPath] = localPath

    const escapedFilename = filename.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    // Match the full attribute value ending with `/<filename>` or `"<filename>"`
    const srcPattern = new RegExp(
      `(<img\\b[^>]*?\\bsrc=["'])([^"']*?)(?:^|/)` + `(${escapedFilename})(["'])`,
      'gi'
    )

    updatedHtml = updatedHtml.replace(
      srcPattern,
      (_match, prefix, _oldDir, file, quote) => `${prefix}${localPath}${quote}`
    )
  }

  return { blobMap, updatedHtml }
}



export function generatePostJson(
  missingItem: { postId: string; title?: string },
  userContext: UserContext,
  mediaFileNames: string[],
  blobMap: Record<string, string>
) {
  return {
    id: missingItem.postId,
    slug: missingItem.postId,
    title: missingItem.title || missingItem.postId.replace(/-/g, ' '),
    status: 'published',
    createdAt: new Date().toISOString(),
    dateLastEdited: new Date().toISOString(),
    author: {
      userId: userContext.userId,
      accountId: userContext.accountId,
      accountSlug: userContext.accountSlug,
      name: userContext.name,
    },
    templateId: 'simple-blog',
    heroImage: mediaFileNames.length > 0 ? `media/${mediaFileNames[0]}` : null,
    blobMap,
  }
}


