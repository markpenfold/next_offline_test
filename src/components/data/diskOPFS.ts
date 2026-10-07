import { AvailableIndex, ProjectConfig, AvailableDataShard } from "@/components/data/dataTypes";
import { BlogPost, ManifestPost, PostStatus, UserContext, AuthorContext } from "@/components/blog/blogHelpers";
import { parseLocalDataShardFileName } from "./cloudR2";

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
  } catch (err) {
    console.error(`❌ Could not find file handle for /${dirName}/${fileName}:`, err);
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

    console.log(`💾 Saved to OPFS: /${dirName}/${fileName}`);
    return `${dirName}/${fileName}`;
  } catch (err) {
    console.error(`❌ OPFS Write Error [/${dirName}/${fileName}]:`, err);
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
  const dirPath = `publishing/drafts/${draftId}/media`
  await saveToOPFSFolder(dirPath, fileName, blob)
  return `${dirPath}/${fileName}`
}

export async function getDraftMediaFile(
  draftId: string,
  fileName: string
): Promise<File | null> {
  const dirPath = `publishing/drafts/${draftId}/media`
  const handle = await getOPFSFileHandle(dirPath, fileName)
  if (!handle) return null
  return await handle.getFile()
}

export async function processAndUploadDraftMedia(
  draftId: string,
  accountId: string,
  accountSlug: string,
  postSlug: string,
  htmlContent: string,
  blobToFilenameMap: Map<string, string>
): Promise<string> {
  let updatedHtml = htmlContent

  for (const [blobUrl, fileName] of blobToFilenameMap.entries()) {
    if (!updatedHtml.includes(blobUrl)) continue

    const file = await getDraftMediaFile(draftId, fileName)
    if (!file) continue

    const formData = new FormData()
    formData.append('file', file)
    formData.append('accountId', accountId)
    formData.append('accountSlug', accountSlug)
    formData.append('postSlug', postSlug)

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Failed to upload ${fileName} during publishing process.`)
    }

    const { url: publicCdnUrl } = await response.json()
    updatedHtml = updatedHtml.replaceAll(blobUrl, publicCdnUrl)
  }

  return updatedHtml
}

export async function deleteDraftFolder(draftId: string): Promise<boolean> {
  return await wipeOPFSFolder(`publishing/drafts/${draftId}`)
}

export async function reconcileDraftFolder(
  parentDir: FileSystemDirectoryHandle,
  subDir: FileSystemDirectoryHandle,
  folderPath: 'publishing/drafts' | 'publishing/published',
  onPurgeNotice?: (slug: string) => void
): Promise<BlogPost | null> {
  const folderKey = subDir.name
  const status: PostStatus = folderPath === 'publishing/drafts' ? 'draft' : 'published'

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
      status,
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
    onPurgeNotice?.(folderKey)
  } catch (err) {
    console.error(`Failed to purge unrecoverable directory ${folderKey}:`, err)
  }

  return null
}

export async function getOPFSPosts(
  folderPath: 'publishing/drafts' | 'publishing/published',
  onPurgeNotice?: (slug: string) => void
): Promise<BlogPost[]> {
  try {
    const dirHandle = await getDirectory(folderPath)
    const posts: BlogPost[] = []
    const status: PostStatus = folderPath === 'publishing/drafts' ? 'draft' : 'published'

    const dirIterable = dirHandle as FileSystemDirectoryHandle & {
      values(): AsyncIterable<FileSystemHandle>
    }

    for await (const entry of dirIterable.values()) {
      if (entry.kind !== 'directory') continue

      const subDir = entry as FileSystemDirectoryHandle

      try {
        let jsonHandle: FileSystemFileHandle
        try {
          jsonHandle = await subDir.getFileHandle('post.json')
        } catch {
          jsonHandle = await subDir.getFileHandle('draft.json')
        }

        const file = await jsonHandle.getFile()
        const rawText = await file.text()
        const metadata = JSON.parse(rawText)

        const fileLastModified = new Date(file.lastModified).toISOString()

        const post: BlogPost = {
          id: metadata.id || subDir.name,
          slug: metadata.slug || metadata.customSlug || metadata.postSlug || subDir.name,
          title: metadata.title || 'Untitled Post',
          subTitle: metadata.subTitle || null,
          status,
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
          folderPath,
          onPurgeNotice
        )
        if (recoveredPost) {
          posts.push(recoveredPost)
        }
      }
    }

    return posts.sort(
      (a, b) => new Date(b.dateLastEdited).getTime() - new Date(a.dateLastEdited).getTime()
    )
  } catch (err) {
    console.error(`Failed to read posts from OPFS [${folderPath}]:`, err)
    return []
  }
}

export async function uploadDraftMediaToR2OLD(
  draftId: string,
  userContext: { accountId: string; accountSlug: string },
  finalSlug: string,
  blobMap: Record<string, string>,
  htmlContent: string,
  heroImage?: string | null
): Promise<string> {
  const mediaEntries = await getOPFSEntries(`publishing/drafts/${draftId}/media`)
  let updatedHtml = htmlContent
  let updatedHeroUrl = heroImage

  for (const { name, handle } of mediaEntries) {
    if (handle.kind !== 'file') continue

    const file = await (handle as FileSystemFileHandle).getFile()

    const formData = new FormData()
    formData.append('file', file)
    formData.append('accountId', userContext.accountId)
    formData.append('accountSlug', userContext.accountSlug)
    formData.append('postSlug', finalSlug)

    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(`Upload failed for ${name}: ${data.error}`)

    const blobUrlEntry = Object.entries(blobMap).find(([_, mappedName]) => mappedName === name)
    if (blobUrlEntry) {
      updatedHtml = updatedHtml.replaceAll(blobUrlEntry[0], data.url)
    }
  }

  return updatedHtml
}


export async function uploadDraftMediaToR2(
  draftId: string,
  userContext: { accountId: string; accountSlug: string },
  finalSlug: string,
  blobMap: Record<string, string>,
  htmlContent: string,
  heroImage?: string | null
): Promise<{ finalHtmlContent: string; finalHeroUrl: string | null }> {
  const mediaEntries = await getOPFSEntries(`publishing/drafts/${draftId}/media`)
  let updatedHtml = htmlContent
  let updatedHeroUrl = heroImage || null

  for (const { name, handle } of mediaEntries) {
    if (handle.kind !== 'file') continue

    const file = await (handle as FileSystemFileHandle).getFile()

    const formData = new FormData()
    formData.append('file', file)
    formData.append('accountId', userContext.accountId)
    formData.append('accountSlug', userContext.accountSlug)
    formData.append('postSlug', finalSlug)

    const res = await fetch('/api/upload', { method: 'POST', body: formData })
    const data = await res.json()
    if (!res.ok) throw new Error(`Upload failed for ${name}: ${data.error}`)

    // Look up the blob: URL associated with this OPFS filename
    const blobEntry = Object.entries(blobMap).find(([_, mappedName]) => mappedName === name)

    if (blobEntry) {
      const [blobUrl] = blobEntry

      // 1. Replace body inline image blob URL
      updatedHtml = updatedHtml.replaceAll(blobUrl, data.url)

      // 2. Replace hero image blob URL with public R2 URL
      if (updatedHeroUrl === blobUrl) {
        updatedHeroUrl = data.url
      }
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

export async function moveDraftToPublished(draftId: string, targetId?: string): Promise<void> {
  const destinationId = targetId || draftId
  const draftsFolder = await getDirectory('publishing/drafts')
  const publishedFolder = await getDirectory('publishing/published')

  const sourceDir = await draftsFolder.getDirectoryHandle(draftId)
  const targetDir = await publishedFolder.getDirectoryHandle(destinationId, { create: true })

  await copyOPFSDirectory(sourceDir, targetDir)

  // update edited date and published status
  try {
    const postJsonHandle = await targetDir.getFileHandle('post.json')
    const file = await postJsonHandle.getFile()
    const metadata: BlogPost = JSON.parse(await file.text())
    
    metadata.status = 'published'
    metadata.dateLastEdited = new Date().toISOString()
    
    const writable = await postJsonHandle.createWritable()
    await writable.write(JSON.stringify(metadata, null, 2))
    await writable.close()
  } catch (e) {
    console.warn(`Could not update status to published in copied post.json:`, e)
  }

  await draftsFolder.removeEntry(draftId, { recursive: true })
}

export async function movePublishedToDraft(postId: string): Promise<void> {
  const draftsFolder = await getDirectory('publishing/drafts')
  const publishedFolder = await getDirectory('publishing/published')

  const sourceDir = await publishedFolder.getDirectoryHandle(postId)
  const targetDir = await draftsFolder.getDirectoryHandle(postId, { create: true })

  await copyOPFSDirectory(sourceDir, targetDir)

  try {
    const postJsonHandle = await targetDir.getFileHandle('post.json')
    const file = await postJsonHandle.getFile()
    const metadata: BlogPost = JSON.parse(await file.text())
    
    metadata.status = 'draft'
    metadata.dateLastEdited = new Date().toISOString()
    
    const writable = await postJsonHandle.createWritable()
    await writable.write(JSON.stringify(metadata, null, 2))
    await writable.close()
  } catch (e) {
    console.warn(`Could not update status to draft in copied post.json:`, e)
  }

  await publishedFolder.removeEntry(postId, { recursive: true })
}

export async function syncAndUploadManifest(uc: UserContext): Promise<ManifestPost[]> {
  const res = await fetch('/api/manifest-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(uc),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to sync manifest with R2')

  return data.manifest as ManifestPost[]
}

export async function reconcileLocalPublishedWithManifest(manifest: ManifestPost[]): Promise<void> {
  try {
    const publishedFolder = await getDirectory('publishing/published')
    const publishedEntries = await getOPFSEntries('publishing/published')
    const manifestIds = new Set(manifest.map((m) => m.id))

    for (const { name, handle } of publishedEntries) {
      if (handle.kind === 'directory' && !manifestIds.has(name)) {
        await publishedFolder.removeEntry(name, { recursive: true })
      }
    }
  } catch (err) {
    console.warn('Failed to reconcile local published directory with remote manifest:', err)
  }
}

export async function removeLocalPublishedPost(postId: string): Promise<void> {
  try {
    const publishedFolder = await getDirectory('publishing/published')
    await publishedFolder.removeEntry(postId, { recursive: true })
  } catch (err) {
    console.warn(`Local published post [${postId}] not found or already deleted from OPFS:`, err)
  }
}

export async function downloadAndSavePublishedPostXXX(
  userContext: UserContext,
  item: { postId: string; postSlug: string; title: string; createdAt?: string }
): Promise<void> {
  
  const listRes = await fetch('/api/list-published', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userContext),
      })
  
  if (!listRes.ok) {
    throw new Error(`Failed to list R2 files for post: ${item.postSlug}`)
  }

  const { files }: { files: Array<{ path: string; url: string }> } = await listRes.json()

  const root = await navigator.storage.getDirectory()
  const pubDir = await root
    .getDirectoryHandle('publishing', { create: true })
    .then((dir) => dir.getDirectoryHandle('published', { create: true }))

  const postFolder = await pubDir.getDirectoryHandle(item.postId, { create: true })

  await Promise.all(
    files.map(async (fileInfo) => {
      const fileRes = await fetch(fileInfo.url)
      if (!fileRes.ok) return

      const pathSegments = fileInfo.path.split('/').filter(Boolean)
      const fileName = pathSegments.pop()!
      
      let targetFolder = postFolder
      for (const segment of pathSegments) {
        targetFolder = await targetFolder.getDirectoryHandle(segment, { create: true })
      }

      const fileHandle = await targetFolder.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()

      const blob = await fileRes.blob()
      await writable.write(blob)
      await writable.close()
    })
  )
}

export async function downloadAndSavePublishedPost(
  userContext: UserContext,
  item: { postId: string; postSlug: string; title: string; createdAt?: string }
): Promise<BlogPost | null> {
  // 1. Fetch published posts list from R2 endpoint
  console.log("Fetching published manifest...")
  const listRes = await fetch('/api/list-published', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userContext),
  })

  if (!listRes.ok) {
    throw new Error(`Failed to list R2 posts: ${item.postSlug}`)
  }

  const data = await listRes.json()
  console.log("CUNTING DATA: ", data)

  // Verify posts array exists
  const posts: Array<{ id: string; postSlug: string; title: string; publishedAt?: string }> = data.posts || []
  const targetPost = posts.find((p) => p.id === item.postId || p.postSlug === item.postSlug)

  if (!targetPost) {
    console.warn(`No post found in R2 matching ID/Slug: ${item.postId} / ${item.postSlug}`)
    return null
  }

  // 2. Fetch the post's index.html from R2 using user-content path
  const htmlUrl = `/user-content/${userContext.accountSlug}/posts/${item.postSlug}/index.html`
  console.log("Downloading post HTML from: ", htmlUrl)

  const htmlRes = await fetch(htmlUrl)
  let htmlContent = ''
  if (htmlRes.ok) {
    htmlContent = await htmlRes.text()
  } else {
    console.warn(`Could not fetch HTML content from ${htmlUrl}`)
  }

  // 3. Prepare target OPFS directory 'publishing/published/<postId>'
  const root = await navigator.storage.getDirectory()
  const pubDir = await root
    .getDirectoryHandle('publishing', { create: true })
    .then((dir) => dir.getDirectoryHandle('published', { create: true }))

  const postFolder = await pubDir.getDirectoryHandle(item.postId, { create: true })

  // 4. Save content.html in OPFS
  const contentHandle = await postFolder.getFileHandle('content.html', { create: true })
  const contentWritable = await contentHandle.createWritable()
  await contentWritable.write(htmlContent)
  await contentWritable.close()

  // 5. Generate post.json in OPFS
  const now = new Date().toISOString()
  const postMetadata: BlogPost = {
    id: item.postId,
    slug: item.postSlug,
    title: item.title || targetPost.title || 'Untitled Post',
    subTitle: null,
    status: 'published',
    createdAt: item.createdAt || targetPost.publishedAt || now,
    dateLastEdited: now,
    author: {
      userId: userContext.userId,
      accountId: userContext.accountId,
      accountSlug: userContext.accountSlug,
      name: userContext.name || 'Author',
    },
    dirHandle: postFolder,
  }

  console.log("OK FUCKNUTS: ", postMetadata)

  const jsonHandle = await postFolder.getFileHandle('post.json', { create: true })
  const jsonWritable = await jsonHandle.createWritable()
  await jsonWritable.write(JSON.stringify({ ...postMetadata, dirHandle: null }, null, 2))
  await jsonWritable.close()

  return {
    ...postMetadata,
    content: htmlContent,
  }
}

export async function getOPFSPostById(
  folderPath: 'publishing/drafts' | 'publishing/published',
  postId: string,
  onPurgeNotice?: (slug: string) => void
): Promise<BlogPost | null> {
  try {
    const dirHandle = await getDirectory(folderPath)
    const subDir = await dirHandle.getDirectoryHandle(postId, { create: false })
    const status: PostStatus = folderPath === 'publishing/drafts' ? 'draft' : 'published'

    try {
      let jsonHandle: FileSystemFileHandle
      try {
        jsonHandle = await subDir.getFileHandle('post.json')
      } catch {
        jsonHandle = await subDir.getFileHandle('draft.json')
      }

      const file = await jsonHandle.getFile()
      const rawText = await file.text()
      const metadata = JSON.parse(rawText)
      const fileLastModified = new Date(file.lastModified).toISOString()

      return {
        id: metadata.id || subDir.name,
        slug: metadata.slug || metadata.customSlug || metadata.postSlug || subDir.name,
        title: metadata.title || 'Untitled Post',
        subTitle: metadata.subTitle || null,
        status,
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
      }
    } catch {
      return await reconcileDraftFolder(dirHandle, subDir, folderPath, onPurgeNotice)
    }
  } catch (err) {
    console.warn(`Post with ID [${postId}] not found in OPFS [${folderPath}]:`, err)
    return null
  }
}

export async function getOPFSPostBySlug(
  folderPath: 'publishing/drafts' | 'publishing/published',
  slug: string,
  onPurgeNotice?: (slug: string) => void
): Promise<BlogPost | null> {
  const posts = await getOPFSPosts(folderPath, onPurgeNotice)
  return posts.find((post) => post.slug === slug) || null
}

export async function pushDraftFromOPFSToR2(
  userContext: UserContext,
  draftId: string
): Promise<{ success: boolean; postSlug: string; error?: string }> {
  try {
    // 1. Get draft directory handle by UUID
    const draftsFolder = await getDirectory('publishing/drafts')
    const draftDir = await draftsFolder.getDirectoryHandle(draftId)

    // 2. Read post.json metadata
    const jsonHandle = await draftDir.getFileHandle('post.json')
    const metaFile = await jsonHandle.getFile()
    const metadata: BlogPost = JSON.parse(await metaFile.text())

    // 3. Read index.html directly
    const htmlHandle = await draftDir.getFileHandle('index.html')
    const htmlFile = await htmlHandle.getFile()

    // 4. Build payload for /api/publish
    const formData = new FormData()
    formData.append('userContext', JSON.stringify(userContext))
    formData.append('metadata', JSON.stringify(metadata))
    formData.append('indexHtml', htmlFile)

    // 5. Append media assets if any exist in the folder
    const dirIterable = draftDir as FileSystemDirectoryHandle & {
      values(): AsyncIterable<FileSystemHandle>
    }

    for await (const entry of dirIterable.values()) {
      if (entry.kind === 'file' && !['post.json', 'draft.json', 'index.html'].includes(entry.name)) {
        const fileHandle = entry as FileSystemFileHandle
        const file = await fileHandle.getFile()
        formData.append(`media_${entry.name}`, file)
      }
    }

    // 6. Post directly to R2 endpoint
    const res = await fetch('/api/publish', {
      method: 'POST',
      body: formData,
    })

    const result = await res.json()
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to upload draft to R2')
    }

    // 7. Move draft -> published in OPFS
    await moveDraftToPublished(draftId)

    return {
      success: true,
      postSlug: metadata.slug,
    }
  } catch (err: any) {
    console.error('Failed to push draft to R2:', err)
    return {
      success: false,
      postSlug: '',
      error: err.message || 'Error pushing draft to remote storage',
    }
  }
}


export async function saveNewDraft(
  post: BlogPost,
  htmlContent: string
): Promise<{ success: boolean; dirHandle: FileSystemDirectoryHandle | null }> {
  try {
    const dirPath = `publishing/drafts/${post.id}`
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
    const dirPath = `publishing/drafts/${post.id}`
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

/** Reads a draft post from OPFS, re-hydrates media blobs, and explicitly marks status as 'draft' */
export async function loadDraft(draftId: string): Promise<BlogPost | null> {
  try {
    const dirPath = `publishing/drafts/${draftId}`

    // 1. Read metadata & HTML content from OPFS
    const rawMeta = (await readFromOPFSFolder(dirPath, 'post.json', 'text')) as string
    let htmlContent = (await readFromOPFSFolder(dirPath, 'index.html', 'text')) as string
    const post: BlogPost = JSON.parse(rawMeta)

    // 2. Re-hydrate binary media blobs into fresh browser Object URLs
    const mediaEntries = await getOPFSEntries(`${dirPath}/media`)
    const updatedBlobMap: Record<string, string> = {}

    for (const { name, handle } of mediaEntries) {
      if ((handle as FileSystemHandle).kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle
        const file = await fileHandle.getFile()
        const freshBlobUrl = URL.createObjectURL(file)
        
        updatedBlobMap[freshBlobUrl] = name

        const oldBlobUrl = Object.keys(post.blobMap || {}).find(
          (key) => post.blobMap?.[key] === name
        )

        if (oldBlobUrl) {
          htmlContent = htmlContent.replaceAll(oldBlobUrl, freshBlobUrl)
        }
      }
    }

    // 3. Get local directory handle reference
    const dirHandle = await getDirectory(dirPath)

    return {
      ...post,
      content: htmlContent,
      blobMap: updatedBlobMap,
      status: 'draft',
      dirHandle,
    }
  } catch (err) {
    console.error(`Failed to load local draft [${draftId}]:`, err)
    return null
  }
}

/** Reads a published post from OPFS or attempts remote sync/manifest fetch if unavailable locally */
export async function loadPublished(
  pubId: string, 
  userContext?: UserContext
): Promise<BlogPost | null> {
  const dirPath = `publishing/published/${pubId}`

  try {
    // 1. Try reading from local OPFS published storage
    const rawMeta = (await readFromOPFSFolder(dirPath, 'post.json', 'text')) as string
    let htmlContent = (await readFromOPFSFolder(dirPath, 'index.html', 'text')) as string
    const post: BlogPost = JSON.parse(rawMeta)

    // 2. Re-hydrate binary media blobs
    const mediaEntries = await getOPFSEntries(`${dirPath}/media`)
    const updatedBlobMap: Record<string, string> = {}

    for (const { name, handle } of mediaEntries) {
      if ((handle as FileSystemHandle).kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle
        const file = await fileHandle.getFile()
        const freshBlobUrl = URL.createObjectURL(file)
        
        updatedBlobMap[freshBlobUrl] = name

        const oldBlobUrl = Object.keys(post.blobMap || {}).find(
          (key) => post.blobMap?.[key] === name
        )

        if (oldBlobUrl) {
          htmlContent = htmlContent.replaceAll(oldBlobUrl, freshBlobUrl)
        }
      }
    }

    const dirHandle = await getDirectory(dirPath)

    return {
      ...post,
      content: htmlContent,
      blobMap: updatedBlobMap,
      status: 'published',
      dirHandle,
    }
  } catch {
    console.warn(`Local published post [${pubId}] not found in OPFS. Attempting remote sync...`)

    // Fallback: If missing locally and context is provided, trigger manifest sync endpoint
    if (userContext?.accountSlug) {
      try {
        const response = await fetch(`/api/manifest-sync?accountSlug=${userContext.accountSlug}`)
        if (!response.ok) throw new Error('Manifest sync request failed')

        const manifestItems: ManifestPost[] = await response.json()
        const match = manifestItems.find((item) => item.id === pubId || item.postSlug === pubId)

        if (match) {
          const syncedPost: BlogPost = {
            id: match.id,
            slug: match.postSlug,
            title: match.title,
            status: 'published',
            createdAt: match.publishedAt,
            dateLastEdited: match.updatedAt,
            author: {
              userId: userContext.userId,
              accountId: userContext.accountId,
              accountSlug: userContext.accountSlug,
              name: 'Author',
            },
            dirHandle: null,
          }

          return syncedPost
        }
      } catch (syncErr) {
        console.error(`Remote manifest sync failed for [${pubId}]:`, syncErr)
      }
    }

    return null
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