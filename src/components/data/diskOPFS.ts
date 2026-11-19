import { AvailableIndex, ProjectConfig, AvailableDataShard } from "@/components/data/dataTypes";
import { BlogPost, UserContext, convertJsonToBlogPost, generateBlobMapAndFixHtml, readLocalPostJson, generatePostJson } from "@/components/blog/blogHelpers";
import { parseLocalDataShardFileName } from "./cloudR2";
import { POSTS_DIR } from "@/lib/utils/constants";

// ============================================================================
// 1. CORE DIRECTORY & FILE PRIMITIVES
// ============================================================================

export async function getDirectory(dirName: string): Promise<FileSystemDirectoryHandle> {
  let currentHandle = await navigator.storage.getDirectory();
  const segments = dirName.split("/").filter((s) => s.length > 0);

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
  }

  return currentHandle;
}

export async function checkFileExists(dirName: string, fileName: string): Promise<boolean> {
  try {
    const dirHandle = await getDirectory(dirName);
    await dirHandle.getFileHandle(fileName, { create: false });
    return true;
  } catch {
    return false;
  }
}

export async function getOPFSFileHandle(
  dirName: string, 
  fileName: string
): Promise<FileSystemFileHandle | null> {
  try {
    const dirHandle = await getDirectory(dirName);
    return await dirHandle.getFileHandle(fileName, { create: false });
  } catch (err: any) {
    // A missing file is expected for optional assets (like hero.webp)
    if (err?.name === 'NotFoundError' || err?.code === 8) {
      return null;
    }
    
    // Log real unexpected errors (e.g. disk permissions or corrupt handles)
    console.warn(`Unexpected error getting handle for /${dirName}/${fileName}:`, err);
    return null;
  }
}

export async function getOPFSEntries(
  dirPath: string
): Promise<Array<{ name: string; handle: FileSystemHandle }>> {
  try {
    const dirHandle = await getDirectory(dirPath)
    const entries: Array<{ name: string; handle: FileSystemHandle }> = []

    const dirIterable = dirHandle as FileSystemDirectoryHandle & {
      values(): AsyncIterable<FileSystemHandle>
    }

    for await (const handle of dirIterable.values()) {
      entries.push({ name: handle.name, handle })
    }

    return entries
  } catch {
    return []
  }
}

export async function getOPFSFiles(
  dirPath: string
): Promise<Array<{ name: string; handle: FileSystemFileHandle }>> {
  const entries = await getOPFSEntries(dirPath)
  return entries.filter(
    (e): e is { name: string; handle: FileSystemFileHandle } => e.handle.kind === 'file'
  )
}

export async function getOPFSDirectories(
  dirPath: string
): Promise<Array<{ name: string; handle: FileSystemDirectoryHandle }>> {
  const entries = await getOPFSEntries(dirPath)
  return entries.filter(
    (e): e is { name: string; handle: FileSystemDirectoryHandle } => e.handle.kind === 'directory'
  )
}




// ============================================================================
// 2. READ / WRITE / DELETE ACTIONS
// ============================================================================

// handle single file writes 
// manages own directory handles
export async function saveToOPFSFolder(
  dirName: string, 
  fileName: string,
  data: string | ArrayBuffer | Blob 
): Promise<string> {
  let writable: FileSystemWritableFileStream | null = null;
  
  try {
    const dirHandle = await getDirectory(dirName);
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    
    writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    writable = null; 

    console.log(`Saved to OPFS: /${dirName}/${fileName}`);
    return `${dirName}/${fileName}`;
  } catch (err) {
    console.error(`OPFS Write Error [/${dirName}/${fileName}]:`, err);
    if (writable) {
      try { await writable.abort(); } catch {}
    }
    throw err; 
  }
}

export type OPFSReadType = 'text' | 'json' | 'arrayBuffer' | 'blob' | 'dataUrl' | 'stream'

export async function readFromOPFSFolder<T = any>(
  dirName: string,
  fileName: string,
  asType: OPFSReadType = 'text'
): Promise<T | null> {
  try {
    const dirHandle = await getDirectory(dirName)
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: false })
    const file = await fileHandle.getFile()

    switch (asType) {
      case 'json': {
        const text = await file.text()
        return text ? JSON.parse(text) : null
      }
      case 'blob':
        return file as unknown as T
      case 'arrayBuffer':
        return (await file.arrayBuffer()) as unknown as T
      case 'stream':
        return file.stream() as unknown as T
      case 'dataUrl':
        return new Promise<T>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as unknown as T)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      case 'text':
      default:
        return (await file.text()) as unknown as T
    }
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      return null
    }

    console.error(`❌ OPFS Read Error [/${dirName}/${fileName}]:`, err)
    throw err
  }
}

export async function deleteOPFSFile(dirName: string, fileName: string): Promise<boolean> {
  try {
    const dirHandle = await getDirectory(dirName);
    await dirHandle.removeEntry(fileName);
    console.log(`🗑️ Deleted: /${dirName}/${fileName}`);
    return true;
  } catch (err) {
    console.warn(`Could not delete /${dirName}/${fileName}`, err);
    return false;
  }
}

export async function wipeOPFSFolder(dirName: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(dirName, { recursive: true });
    await getDirectory(dirName);
    console.log(`🧹 OPFS directory /${dirName} wiped clean!`);
    return true;
  } catch (err) {
    return false;
  }
}

export async function getLocalOPFSIndexes(onLog?: (msg: string) => void): Promise<AvailableIndex[]> {
  const log = (msg: string) => onLog?.(msg);
  const foundIndexes: AvailableIndex[] = [];

  try {
    const entries = await getOPFSFiles("indexes");

    for (const { name, handle } of entries) {
      if (!name.endsWith('.parquet') || name.startsWith('_temp_')) {
        continue;
      }

      if (name.startsWith('index__')) {
        const parts = name.replace('.parquet', '').split('__');
        
        const tier = (parts[1] as "free" | "pro") || 'free';
        const cat = parts[2] || 'unknown';
        const rawVersion = parts.length >= 5 ? parts[4] : parts[3] || 'v1';
        const version = rawVersion.replace(/^version=/, '');
        
        const file = await handle.getFile();

        foundIndexes.push({
          key: name, 
          fileName: name,
          tier,
          category: cat,
          version,
          sizeBytes: file.size,
          s3Keys: [],
          handle,
        });
      }
    }
    
    log(`✅ Discovered ${foundIndexes.length} parquet index files in OPFS cache (/indexes).`);
    return foundIndexes;
  } catch (err: any) {
    log(`❌ Error scanning OPFS /indexes directory: ${err.message}`);
    console.error(err);
    return [];
  }
}

export async function getLocalOPFSDataShardsA(): Promise<AvailableDataShard[]> {
  const foundShards: AvailableDataShard[] = [];

  try {
    const entries = await getOPFSFiles("data");

    for (const { name, handle } of entries) {
      if (name.endsWith('.parquet')) {
        const cleanName = name.replace('.parquet', '');
        const parts = cleanName.split('__');

        const tier = (parts[1] as "free" | "pro") || 'free';
        const masterCategory = parts[2] || 'unknown';
        const era = parts[3] || 'all';
        const version = parts[4] || 'v1';

        const file = await handle.getFile();

        foundShards.push({
          fileName: name,
          s3Key: name,
          masterCategory,
          era,
          tier,
          version,
          sizeBytes: file.size,
        });
      }
    }

    console.log(`✅ Discovered ${foundShards.length} parquet shard file(s) in OPFS (/data).`);
    return foundShards;
  } catch (err: any) {
    console.error(err);
    return [];
  }
}

export async function getLocalOPFSDataShards(): Promise<AvailableDataShard[]> {
  const foundShards: AvailableDataShard[] = [];

  try {
    const entries = await getOPFSFiles("data");

    for (const { name, handle } of entries) {
      if (name.endsWith('.parquet')) {
        const parsed = parseLocalDataShardFileName(name);
        const file = await handle.getFile();

        if (parsed) {
          foundShards.push({
            fileName: name,
            s3Key: name,
            masterCategory: parsed.category,
            era: parsed.era,
            tier: (parsed.tier === "pro" ? "pro" : "free"),
            version: parsed.version,
            sizeBytes: file.size,
          });
        } else {
          const cleanName = name.replace('.parquet', '');
          const parts = cleanName.split('_');

          const tier = (parts[0] === "pro" ? "pro" : "free");
          const version = parts[parts.length - 1] || 'v1';
          const era = parts.slice(-3, -1).join('_');
          const masterCategory = parts.slice(1, -3).join('_');

          foundShards.push({
            fileName: name,
            s3Key: name,
            masterCategory,
            era,
            tier,
            version,
            sizeBytes: file.size,
          });
        }
      }
    }

    console.log(`✅ Discovered ${foundShards.length} parquet shard file(s) in OPFS (/data).`);
    return foundShards;
  } catch (err: any) {
    console.error("🚨 Error scanning local OPFS data shards:", err);
    return [];
  }
}





// ============================================================================
// 3. PROJECT & SESSION PERSISTENCE
// ============================================================================

function resolveProjectFileName(projectName?: string | null): string {
  if (!projectName || projectName === "session") return "session.json";
  return projectName.endsWith(".json") ? projectName : `${projectName}.json`;
}

export async function loadProject(
  accountId: string, 
  projectName?: string | null
): Promise<ProjectConfig | null> {
  try {
    const dirPath = `savedProjects/${accountId}`
    const fileName = resolveProjectFileName(projectName)
    return await readFromOPFSFolder<ProjectConfig>(dirPath, fileName, 'json')
  } catch (err) {
    console.warn(`Could not load project/session context [${projectName || "session"}]`, err)
    return null
  }
}

export async function saveProject(
  accountId: string, 
  projectName: string | null | undefined, 
  patch: Partial<ProjectConfig>
): Promise<boolean> {
  const fileName = resolveProjectFileName(projectName);
  const dirPath = `savedProjects/${accountId}`;

  try {
    const existing = (await loadProject(accountId, projectName)) || {};
    
    const updatedConfig = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    const serializedData = JSON.stringify(updatedConfig, null, 2);
    await saveToOPFSFolder(dirPath, fileName, serializedData);
    
    return true;
  } catch (err) {
    console.error(`❌ Failed to write project/session data [${fileName}]:`, err);
    return false;
  }
}

export async function getSavedProjects(
  accountId: string
): Promise<Array<{ name: string; handle: FileSystemFileHandle }>> {
  try {
    const dirPath = `savedProjects/${accountId}`;
    const entries = await getOPFSFiles(dirPath);

    return entries.filter(
      ({ name }) => name.endsWith(".json") && name !== "session.json" && name !== "webGPUStatus.json"
    );
  } catch (err) {
    console.error(`Failed to scan OPFS savedProjects for account ${accountId}:`, err);
    return [];
  }
}






// ============================================================================
// 4. PUBLISHING & DRAFT MANAGEMENT
// ============================================================================
export async function saveDraftMedia(
  draftId: string,
  fileName: string,
  blob: Blob
): Promise<string> {
  const dirPath = `publishing/${draftId}/media`
  // Reuses core saveToOPFSFolder primitive
  return await saveToOPFSFolder(dirPath, fileName, blob)
}

export async function removeDraftMedia(
  draftId: string,
  fileName: string
): Promise<boolean> {
  const dirPath = `publishing/${draftId}/media`
  // Reuses core deleteOPFSFile primitive (handles file opening & errors cleanly)
  return await deleteOPFSFile(dirPath, fileName)
}

export async function getLocalMediaFile(
  postId: string,
  fileName: string
): Promise<File | null> {
  const dirPath = `publishing/${postId}/media`
  const handle = await getOPFSFileHandle(dirPath, fileName)
  if (!handle) return null
  return await handle.getFile()
}

/** Helper to fetch hero.webp and return a Blob URL preview for React state */
export async function getHeroImageUrl(
  postId: string
): Promise<string | null> {
  const file = await getLocalMediaFile(postId, 'hero.webp')
  if (!file) return null
  return URL.createObjectURL(file)
}

// attempt fix where post.json missing
export async function reconcileDraftFolder(
  parentDir: FileSystemDirectoryHandle,
  subDir: FileSystemDirectoryHandle,
): Promise<BlogPost | null> {
  const folderKey = subDir.name

  let hasContent = false
  try {
    await subDir.getFileHandle('content.html')
    hasContent = true
  } catch {
    hasContent = false
  }

  if (hasContent) {
    const now = new Date().toISOString()

    const repairedPost: BlogPost = {
      id: folderKey,
      slug: folderKey,
      title: `Recovered Post (${folderKey.slice(0, 8)})`,
      subTitle: null,
      status: 'draft',
      createdAt: now,
      dateLastEdited: now,
      author: {
        userId: '',
        accountId: '',
        accountSlug: '',
        name: 'Recovered Author',
      },
      dirHandle: subDir,
    }

    try {
      const metadataToStore = {
        ...repairedPost,
        dirHandle: null,
      }

      const jsonHandle = await subDir.getFileHandle('post.json', { create: true })
      const writable = await jsonHandle.createWritable()
      await writable.write(JSON.stringify(metadataToStore, null, 2))
      await writable.close()

      return repairedPost
    } catch (err) {
      console.error(`Failed to create repaired post.json for ${folderKey}:`, err)
    }
  }

  try {
    await parentDir.removeEntry(folderKey, { recursive: true })
  } catch (err) {
    console.error(`Failed to purge unrecoverable directory ${folderKey}:`, err)
  }

  return null
}

export async function getOPFSPosts(
  statusFilter?: 'draft' | 'published'
): Promise<BlogPost[]> {
  try {
    const dirHandle = await getDirectory('publishing')
    const posts: BlogPost[] = []

    const dirIterable = dirHandle as FileSystemDirectoryHandle & {
      values(): AsyncIterable<FileSystemHandle>
    }

    for await (const entry of dirIterable.values()) {
      if (entry.kind !== 'directory') continue
      const subDir = entry as FileSystemDirectoryHandle

      try {
        let jsonHandle: FileSystemFileHandle = await subDir.getFileHandle('post.json')
        
        const file = await jsonHandle.getFile()
        const rawText = await file.text()
        const metadata = JSON.parse(rawText)
        const fileLastModified = new Date(file.lastModified).toISOString()

        // what does the post.json file say? Fallback to draft if it is silent
        const postStatus = metadata.status || 'draft'

        // Apply status filter if provided
        if (statusFilter && postStatus !== statusFilter) {
          continue
        }

        const post: BlogPost = {
          id: metadata.id || subDir.name,
          slug: metadata.slug || metadata.customSlug || metadata.postSlug || subDir.name,
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
          dirHandle: subDir,
          heroImage: metadata.heroImage || null,
        }

        posts.push(post)
      } catch {
        const recoveredPost = await reconcileDraftFolder(
          dirHandle,
          subDir,        
        )
        if (recoveredPost) {
          const recoveredStatus = recoveredPost.status || 'draft'
          if (!statusFilter || recoveredStatus === statusFilter) {
            posts.push(recoveredPost)
          }
        }
      }
    }

    return posts.sort(
      (a, b) => new Date(b.dateLastEdited).getTime() - new Date(a.dateLastEdited).getTime()
    )
  } catch (err) {
    console.error(`Failed to read posts from OPFS:`, err)
    return []
  }
}

// clear existing R2 media files in case this is a re-pub
export async function uploadDraftMediaToR2(
  draftId: string,
  userContext: UserContext,
  finalSlug: string,
  blobMap: Record<string, string>,
  htmlContent: string,
  heroImage?: string | null
): Promise<{ finalHtmlContent: string; finalHeroUrl: string | null }> {
  const mediaEntries = await getOPFSEntries(`publishing/${draftId}/media`)
  let updatedHtml = htmlContent
  let updatedHeroUrl: string | null = null

  if (mediaEntries.length > 0) {
    // 1. Clear the R2 media folder ONCE before uploading the fresh set
    
    // In case this is an update we must clear the current media folder if it exists
    const clearRes = await fetch('/api/clearPostMedia', { method: 'POST', body: JSON.stringify({
        accountSlug: userContext.accountSlug,
        postId: draftId,
        accountId: userContext.accountId,
      }),
})
    console.log("clearRes:", clearRes)
    if (!clearRes.ok) {
        const errText = await clearRes.text()
        let errorMessage = errText
        try {
          const errData = JSON.parse(errText)
          errorMessage = errData.error || errText
        } catch {
          // If the server sent back HTML or plain text, keep it as the error message
        }
        throw new Error(`Failed to clear old media: ${errorMessage || clearRes.statusText}`)
      }
    }

  // 2. Loop through and upload each file safely
  for (const { name, handle } of mediaEntries) {
    if (handle.kind !== 'file') continue

    const file = await (handle as FileSystemFileHandle).getFile()

    const formData = new FormData()
    formData.append('file', file)
    formData.append('accountId', userContext.accountId)
    formData.append('accountSlug', userContext.accountSlug)
    formData.append('postId', draftId)
    formData.append('postSlug', finalSlug)

    const res = await fetch('/api/uploadMedia', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(`Upload failed for ${name}: ${data.error}`)

    // 3. Explicitly catch standardized hero image
    if (name === 'hero.webp') {
      updatedHeroUrl = data.url
      continue
    }

    // 4. Catch inline body images registered in blobMap
    const blobEntry = Object.entries(blobMap).find(([_, mappedName]) => mappedName === name)
    if (blobEntry) {
      const [blobUrl] = blobEntry
      updatedHtml = updatedHtml.replaceAll(blobUrl, data.url)
    }
  }

  return {
    finalHtmlContent: updatedHtml,
    finalHeroUrl: updatedHeroUrl,
  }
}

export async function copyOPFSDirectory(
  src: FileSystemDirectoryHandle, 
  dest: FileSystemDirectoryHandle
): Promise<void> {
  const iterable = src as FileSystemDirectoryHandle & {
    values(): AsyncIterable<FileSystemHandle>
  }
  
  for await (const entry of iterable.values()) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile()
      const newFileHandle = await dest.getFileHandle(entry.name, { create: true })
      const writable = await newFileHandle.createWritable()
      await writable.write(file)
      await writable.close()
    } else if (entry.kind === 'directory') {
      const subDest = await dest.getDirectoryHandle(entry.name, { create: true })
      await copyOPFSDirectory(entry as FileSystemDirectoryHandle, subDest)
    }
  }
}

export async function removeLocalPost(postId: string): Promise<void> {
  try {
    const publishedFolder = await getDirectory('publishing')
    await publishedFolder.removeEntry(postId, { recursive: true })
  } catch (err) {
    console.warn(`Local published post [${postId}] not found or already deleted from OPFS:`, err)
  }
}


function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

interface RemotePostFile {
  relativePath: string
  content: string
  encoding: 'utf-8' | 'base64'
  contentType?: string
}

// Takes already existing dir handle
// will create any intermediate folder structure
async function writeFileToDir(
  dirHandle: FileSystemDirectoryHandle,
  relativePath: string,
  data: string | ArrayBuffer | Blob
): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) return

  let targetDir = dirHandle
  for (const folder of parts) {
    targetDir = await targetDir.getDirectoryHandle(folder, { create: true })
  }

  const fileHandle = await targetDir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(data)
    await writable.close()
  } catch (err) {
    await writable.abort().catch(() => {})
    throw err
  }
}

interface RemotePostFile {
  relativePath: string
  content: string
  encoding: 'utf-8' | 'base64'
  contentType?: string
}

export async function downloadAndSavePublishedPost(
  userContext: UserContext,
  missingItem: { postId: string }
) {
  try {
    // 1. Fetch the full folder bundle from R2
    const res = await fetch('/api/get-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountSlug: userContext.accountSlug,
        postId: missingItem.postId,
        accountId: userContext.accountId,
      }),
    })

    if (!res.ok) {
      throw new Error(`Failed to fetch post folder for ${missingItem.postId} (${res.status})`)
    }

    const { files }: { files: RemotePostFile[] } = await res.json()
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error(`No files returned for post ${missingItem.postId}`)
    }

    // 2. Open OPFS directory named with postId
    const rootDir = await getDirectory('publishing')
    const postDirHandle = await rootDir.getDirectoryHandle(missingItem.postId, {
      create: true,
    })

    let htmlContent = ''
    let postJson = ''
    const mediaFilenames: string[] = []

    // 3. Write all files inside the postId folder
    for (const file of files) {
      if (!file.relativePath || file.relativePath.endsWith('/')) {
        continue
      }

      if (file.relativePath === 'index.html' && file.encoding === 'utf-8') {
        htmlContent = file.content
      }
      if (file.relativePath === 'post.json' && file.encoding === 'utf-8') {
        postJson = file.content
      }
      if (file.relativePath.startsWith('media/') && file.encoding === 'base64') {
        mediaFilenames.push(file.relativePath.slice('media/'.length))
      }

      const payload: string | ArrayBuffer =
        file.encoding === 'base64'
          ? base64ToArrayBuffer(file.content)
          : file.content

      await writeFileToDir(postDirHandle, file.relativePath, payload)
    }

    return true
  } catch (err) {
    console.error(`Error saving post folder ${missingItem.postId}:`, err)
    return false
  }
}



export async function saveNewDraft(
  post: BlogPost,
  htmlContent: string
): Promise<{ success: boolean; dirHandle: FileSystemDirectoryHandle | null }> {
  try {
    const dirPath = `${POSTS_DIR}${post.id}`
    const now = new Date().toISOString()

    const metadataToStore: BlogPost = {
      ...post,
      status: 'draft',
      dateLastEdited: now,
      dirHandle: null, // Omit DOM handle from serialized JSON
    }

    await saveToOPFSFolder(dirPath, 'post.json', JSON.stringify(metadataToStore, null, 2))
    await saveToOPFSFolder(dirPath, 'index.html', htmlContent)

    const dirHandle = await getDirectory(dirPath)
    return { success: true, dirHandle }
  } catch (err) {
    console.error(`Failed to save draft [${post.id}]:`, err)
    return { success: false, dirHandle: null }
  }
}

/** Saves or updates a post in OPFS under publishing/drafts/{id} */
export async function saveDraft(
  post: BlogPost,
  htmlContent: string
): Promise<{ success: boolean; dirHandle: FileSystemDirectoryHandle | null }> {
  try {
    const dirPath = `${POSTS_DIR}${post.id}`
    const now = new Date().toISOString()

    const metadataToStore: BlogPost = {
      ...post,
      status: 'draft',
      dateLastEdited: now,
      dirHandle: null, // Omit DOM handle from serialized JSON
    }

    await saveToOPFSFolder(dirPath, 'post.json', JSON.stringify(metadataToStore, null, 2))
    await saveToOPFSFolder(dirPath, 'index.html', htmlContent)

    const dirHandle = await getDirectory(dirPath)
    return { success: true, dirHandle }
  } catch (err) {
    console.error(`Failed to save draft [${post.id}]:`, err)
    return { success: false, dirHandle: null }
  }
}


async function rehydrateMediaFromOPFS(
  dirPath: string,
  post: BlogPost,
  initialHtml: string
): Promise<{
  blobMap: Record<string, string>
  htmlContent: string
  heroImage: string | null
}> {
  const blobMap: Record<string, string> = {}
  let htmlContent = initialHtml
  let heroImage: string | null = post.heroImage || null

  try {
    const mediaEntries = await getOPFSEntries(`${dirPath}/media`)

    for (const { name, handle } of mediaEntries) {
      if ((handle as FileSystemHandle).kind !== 'file') continue

      const file = await (handle as FileSystemFileHandle).getFile()
      const freshBlobUrl = URL.createObjectURL(file)
      blobMap[freshBlobUrl] = name

      // 1. Match heroImage by filename (or legacy "hero" naming)
      const isHero =
        name.includes('hero') ||
        Boolean(
          heroImage &&
            (heroImage.endsWith(`/${name}`) ||
              heroImage === `media/${name}` ||
              heroImage === name)
        )

      if (isHero) {
        heroImage = freshBlobUrl
      }

      // 2. Replace old blob URL from post.blobMap if present
      const oldBlobUrl = Object.keys(post.blobMap || {}).find(
        (key) => post.blobMap?.[key] === name
      )
      if (oldBlobUrl) {
        htmlContent = htmlContent.replaceAll(oldBlobUrl, freshBlobUrl)
      }

      // 3. Also replace local/R2 media paths referencing this filename
      const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      const mediaRefRegex = new RegExp(
        `(?<=src=["'])[^"']*(?:^|/)media/${escapedName}(?:[?#][^"']*)?(?=["'])`,
        'g'
      )
      htmlContent = htmlContent.replace(mediaRefRegex, freshBlobUrl)
    }
  } catch {
    // No media/ directory for this post
  }

  return { blobMap, htmlContent, heroImage }
}

/** Reads a draft post from OPFS, re-hydrates media blobs, and explicitly marks status as 'draft' */
export async function loadPost(draftId: string): Promise<BlogPost | null> {
  try {
    const dirPath = `${POSTS_DIR}${draftId}`

    // 1. Read metadata & HTML content from OPFS
    const rawMeta = (await readFromOPFSFolder(dirPath, 'post.json', 'text')) as string
    let initialHtml = (await readFromOPFSFolder(dirPath, 'index.html', 'text')) as string

    const post: BlogPost = JSON.parse(rawMeta)

    const { blobMap, htmlContent, heroImage } = await rehydrateMediaFromOPFS(
      dirPath,
      post,
      initialHtml
    )
  
    const dirHandle = await getDirectory(dirPath)

    return {
      ...post,
      heroImage,
      content: htmlContent,
      blobMap,
      status: post.status || 'draft',
      dirHandle,
    }
  } catch (err) {
    console.error(`Failed to load local draft [${draftId}]:`, err)
    return null
  }
}

export async function getOPFSPostById(basePath: string, postId: string): Promise<BlogPost | null> {
  try {
    // 1. Access the specific post folder inside the base directory (e.g., 'publishing/uuid-here')
    const subDir = await getDirectory(`${basePath}/${postId}`)
    
    // 2. Read the post.json file handle
    const jsonHandle = await subDir.getFileHandle('post.json')
    const file = await jsonHandle.getFile()
    const rawText = await file.text()
    const metadata = JSON.parse(rawText)
    const fileLastModified = new Date(file.lastModified).toISOString()

    // 3. Convert raw JSON metadata into a fully typed BlogPost using your existing helper
    return convertJsonToBlogPost(metadata, subDir, fileLastModified)
  } catch (err) {
    console.error(`Failed to fetch OPFS post by ID (${postId}) from basePath (${basePath}):`, err)
    return null
  }
}

export async function rebuildLocalManifest(): Promise<BlogPost[]> {
  try {
    // 1. Fetch all local posts (sorted newest first by dateLastEdited)
    const posts = await getOPFSPosts()

    const manifestData = {
      posts,
      updatedAt: new Date().toISOString(),
    }

    // 2. Write manifest.json to the root 'publishing' OPFS directory
    const rootDir = await getDirectory('publishing')
    const fileHandle = await rootDir.getFileHandle('manifest.json', { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(JSON.stringify(manifestData, null, 2))
    await writable.close()

    return posts
  } catch (err) {
    console.error('Failed to rebuild local OPFS manifest:', err)
    return []
  }
}










// ============================================================================
// 5. GPU STATUS PERSISTENCE
// ============================================================================

export interface OPFSGpuSettings {
  gpuPreference: 'unset' | 'webgpu' | 'webgl';
  updatedAt: string;
}

const GPU_FILE_NAME = 'webGPUStatus.json';

export async function saveGpuSettingsToOPFS(
  accountId: string,
  settings: OPFSGpuSettings
): Promise<boolean> {
  if (!accountId || typeof window === 'undefined') return false;

  const dirPath = `savedProjects/${accountId}`;
  const serializedData = JSON.stringify(settings, null, 2);

  try {
    await saveToOPFSFolder(dirPath, GPU_FILE_NAME, serializedData);
    return true;
  } catch (err) {
    console.error(`❌ Failed to write ${GPU_FILE_NAME} for account [${accountId}]:`, err);
    return false;
  }
}

export async function loadGpuSettingsFromOPFS(
  accountId: string
): Promise<OPFSGpuSettings | null> {
  if (!accountId || typeof window === 'undefined') return null;

  const dirPath = `savedProjects/${accountId}`;

  try {
    const exists = await checkFileExists(dirPath, GPU_FILE_NAME);
    if (!exists) return null;

    const rawData = await readFromOPFSFolder(dirPath, GPU_FILE_NAME, "text");
    if (!rawData) return null;

    const jsonString =
      typeof rawData === 'string'
        ? rawData
        : new TextDecoder().decode(rawData);

    return JSON.parse(jsonString) as OPFSGpuSettings;
  } catch (err) {
    return null;
  }
}