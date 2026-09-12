import { AvailableIndex, ProjectConfig, AvailableDataShard } from "@/components/data/dataTypes";

import { parseLocalDataShardFileName } from "./cloudR2";

// ============================================================================
// 1. CORE DIRECTORY & FILE PRIMITIVES
// ============================================================================

// Get or create a specific directory path in OPFS.
//Supports relative paths like "savedProjects/acc_123"
 
export async function getDirectory(dirName: string): Promise<FileSystemDirectoryHandle> {
  let currentHandle = await navigator.storage.getDirectory();
  const segments = dirName.split("/").filter((s) => s.length > 0);

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
  }

  return currentHandle;
}

//Checks if a specific file exists within an OPFS directory
export async function checkFileExists(dirName: string, fileName: string): Promise<boolean> {
  try {
    const dirHandle = await getDirectory(dirName);
    await dirHandle.getFileHandle(fileName, { create: false });
    return true;
  } catch {
    return false;
  }
}

//Fetches a single FileSystemFileHandle for DuckDB VFS mounting
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

//Returns all (name + file handle) entries in a specified OPFS folder
export async function getOPFSEntries(
  dirName: string
): Promise<Array<{ name: string; handle: FileSystemFileHandle }>> {
  try {
    const dirHandle = await getDirectory(dirName);
    const entries: Array<{ name: string; handle: FileSystemFileHandle }> = [];

    const dirIterable = dirHandle as FileSystemDirectoryHandle & {
      values(): AsyncIterable<FileSystemHandle>;
    };

    for await (const handle of dirIterable.values()) {
      if (handle.kind === "file") {
        entries.push({ name: handle.name, handle: handle as FileSystemFileHandle });
      }
    }

    return entries;
  } catch (err) {
    return [];
  }
}
// ============================================================================
// 2. READ / WRITE / DELETE ACTIONS
// ============================================================================

//Atomic write into an OPFS folder (uses transaction abort protection)
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
    // Gracefully handle uninitialized files/drafts without logging errors
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

//Scans local OPFS index files, extracting schemas for initialization
export async function getLocalOPFSIndexes(onLog?: (msg: string) => void): Promise<AvailableIndex[]> {
  const log = (msg: string) => onLog?.(msg);
  const foundIndexes: AvailableIndex[] = [];

  try {
    const entries = await getOPFSEntries("indexes");

    for (const { name, handle } of entries) {
      // Ignore non-parquet files and temporary compaction shards
      if (!name.endsWith('.parquet') || name.startsWith('_temp_')) {
        continue;
      }

      if (name.startsWith('index__')) {
        const parts = name.replace('.parquet', '').split('__');
        
        const tier = (parts[1] as "free" | "pro") || 'free';
        const cat = parts[2] || 'unknown';
        // Fallback checks for version positioning depending on naming scheme
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
          s3Keys: [], // Empty array for local OPFS files (no remote download needed)
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
    // Scan the 'data' directory matching datastore.getFullDataShards
    const entries = await getOPFSEntries("data");

    for (const { name, handle } of entries) {
      if (name.endsWith('.parquet')) {
        // Standardized name format generated by buildLocalDataShardFileName:
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
    const entries = await getOPFSEntries("data");

    for (const { name, handle } of entries) {
      if (name.endsWith('.parquet')) {
        // Parse "pro_architecture_design_pre_1900_v1.parquet"
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
          // Fallback parsing if filename standard varies
          const cleanName = name.replace('.parquet', '');
          const parts = cleanName.split('_');

          const tier = (parts[0] === "pro" ? "pro" : "free");
          const version = parts[parts.length - 1] || 'v1';
          const era = parts.slice(-3, -1).join('_'); // e.g. "pre_1900"
          const masterCategory = parts.slice(1, -3).join('_'); // e.g. "architecture_design"

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

/** 
export async function loadProjectX(
  accountId: string, 
  projectName?: string | null
): Promise<ProjectConfig | null> {
  try {
    const dirPath = `savedProjects/${accountId}`;
    const fileName = resolveProjectFileName(projectName);
    
    const hasFile = await checkFileExists(dirPath, fileName);
    if (!hasFile) return null;

    const text = (await readFromOPFSFolder(dirPath, fileName, "text")) as string;
    return JSON.parse(text) as ProjectConfig;
  } catch (err) {
    console.warn(`Could not load project/session context [${projectName || "session"}]`, err);
    return null;
  }
}*/


export async function loadProject(
  accountId: string, 
  projectName?: string | null
): Promise<ProjectConfig | null> {
  try {
    const dirPath = `savedProjects/${accountId}`
    const fileName = resolveProjectFileName(projectName)
    
    // Direct call handles existence check + JSON parsing in one step
    return await readFromOPFSFolder<ProjectConfig>(dirPath, fileName, 'json')
  } catch (err) {
    console.warn(`Could not load project/session context [${projectName || "session"}]`, err)
    return null
  }
}

// This should really be 'saveExistingProject'
export async function saveProject(
  accountId: string, 
  projectName: string | null | undefined, 
  patch: Partial<ProjectConfig>
): Promise<boolean> {
  const fileName = resolveProjectFileName(projectName);
  const dirPath = `savedProjects/${accountId}`;
  console.log("SAVING PROJECT:", projectName, patch);

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
    const entries = await getOPFSEntries(dirPath);

    // 💡 Filter out system json files (session.json & webGPUStatus.json)
    return entries.filter(
      ({ name }) => name.endsWith(".json") && name !== "session.json" && name !== "webGPUStatus.json"
    );
  } catch (err) {
    console.error(`Failed to scan OPFS savedProjects for account ${accountId}:`, err);
    return [];
  }
}

// ============================================================================
// 5. PUBLISHING & DRAFT MANAGEMENT
// ============================================================================

/**
 * Saves a draft image asset into OPFS under /publishing/drafts/<draftId>/media/
 */
export async function saveDraftMedia(
  draftId: string,
  fileName: string,
  blob: Blob
): Promise<string> {
  const dirPath = `publishing/drafts/${draftId}/media`
  await saveToOPFSFolder(dirPath, fileName, blob)
  
  // Return the path reference
  return `${dirPath}/${fileName}`
}

/**
 * Retrieves a File handle for an image stored in a draft folder
 */
export async function getDraftMediaFile(
  draftId: string,
  fileName: string
): Promise<File | null> {
  const dirPath = `publishing/drafts/${draftId}/media`
  const handle = await getOPFSFileHandle(dirPath, fileName)
  if (!handle) return null
  return await handle.getFile()
}

/**
 * Sweeps a draft's HTML, extracts all inline `blob:` URLs, uploads their
 * corresponding binary files from OPFS to R2, and replaces the blob links
 * with permanent CDN URLs.
 */
export async function processAndUploadDraftMedia(
  draftId: string,
  accountId: string,
  accountSlug: string,
  postSlug: string,
  htmlContent: string,
  blobToFilenameMap: Map<string, string> // Map<blobUrl, originalFileName>
): Promise<string> {
  let updatedHtml = htmlContent

  for (const [blobUrl, fileName] of blobToFilenameMap.entries()) {
    if (!updatedHtml.includes(blobUrl)) continue

    // 1. Load the binary file from OPFS
    const file = await getDraftMediaFile(draftId, fileName)
    if (!file) continue

    // 2. Prepare FormData payload for /api/upload
    const formData = new FormData()
    formData.append('file', file)
    formData.append('accountId', accountId)
    formData.append('accountSlug', accountSlug)
    formData.append('postSlug', postSlug)

    // 3. Upload to Cloudflare R2
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Failed to upload ${fileName} during publishing process.`)
    }

    const { url: publicCdnUrl } = await response.json()

    // 4. Swap the local blob URL with the permanent R2 CDN URL
    updatedHtml = updatedHtml.replaceAll(blobUrl, publicCdnUrl)
  }

  return updatedHtml
}

/**
 * Cleans up local draft files once publishing succeeds
 */
export async function deleteDraftFolder(draftId: string): Promise<boolean> {
  return await wipeOPFSFolder(`publishing/drafts/${draftId}`)
}


















// ============================================================================
// 4. GPU STATUS PERSISTENCE
// ============================================================================

export interface OPFSGpuSettings {
  gpuPreference: 'unset' | 'webgpu' | 'webgl';
  updatedAt: string;
}

const GPU_FILE_NAME = 'webGPUStatus.json';

/**
 * Saves webGPUStatus.json inside savedProjects/${accountId} using OPFS primitives.
 */
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

/**
 * Loads webGPUStatus.json from savedProjects/${accountId} using OPFS primitives.
 */
export async function loadGpuSettingsFromOPFS(
  accountId: string
): Promise<OPFSGpuSettings | null> {
  if (!accountId || typeof window === 'undefined') return null;

  const dirPath = `savedProjects/${accountId}`;

  try {
    // 💡 Prevent console noise by checking if the file exists before attempting to read
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