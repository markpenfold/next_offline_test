import { AvailableIndex, ProjectConfig, AvailableDataShard } from "@/components/data/dataTypes";

import { parseLocalDataShardFileName } from "./cloudR2";

// ============================================================================
// 1. CORE DIRECTORY & FILE PRIMITIVES
// ============================================================================

/**
 * Get or create a specific directory path in OPFS.
 * Supports relative paths like "savedProjects/acc_123"
 */
export async function getDirectory(dirName: string): Promise<FileSystemDirectoryHandle> {
  let currentHandle = await navigator.storage.getDirectory();
  const segments = dirName.split("/").filter((s) => s.length > 0);

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
  }

  return currentHandle;
}

/**
 * Checks if a specific file exists within an OPFS directory
 */
export async function checkFileExists(dirName: string, fileName: string): Promise<boolean> {
  try {
    const dirHandle = await getDirectory(dirName);
    await dirHandle.getFileHandle(fileName, { create: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetches a single FileSystemFileHandle for DuckDB VFS mounting
 */
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

/**
 * Returns all (name + file handle) entries in a specified OPFS folder
 */
export async function getOPFSEntries(
  dirName: string
): Promise<Array<{ name: string; handle: FileSystemFileHandle }>> {
  try {
    const dirHandle = await getDirectory(dirName);
    const entries: Array<{ name: string; handle: FileSystemFileHandle }> = [];

    const entriesIterator = dirHandle.entries() as AsyncIterable<[string, FileSystemHandle]>;
    for await (const [name, handle] of entriesIterator) {
      if (handle.kind === "file") {
        entries.push({ name, handle: handle as FileSystemFileHandle });
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

/**
 * Atomic write into an OPFS folder (uses transaction abort protection)
 */
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

/**
 * Reads text or binary buffers from OPFS
 */
export async function readFromOPFSFolder(
  dirName: string,
  fileName: string,
  asType: 'text' | 'arrayBuffer' = 'text'
): Promise<string | ArrayBuffer> {
  try {
    const dirHandle = await getDirectory(dirName);
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    
    return asType === 'text' ? await file.text() : await file.arrayBuffer();
  } catch (err) {
    console.error(`❌ OPFS Read Error [/${dirName}/${fileName}]:`, err);
    throw err; 
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

/**
 * Scans local OPFS index files, extracting schemas for initialization
 */
export async function getLocalOPFSIndexes(onLog?: (msg: string) => void): Promise<AvailableIndex[]> {
  const log = (msg: string) => onLog?.(msg);
  const foundIndexes: AvailableIndex[] = [];

  try {
    const entries = await getOPFSEntries("indexes");

    for (const { name, handle } of entries) {
      if (name.endsWith('.parquet') && name.startsWith('index__')) {
        const parts = name.replace('.parquet', '').split('__');
        
        const tier = (parts[1] as "free" | "pro") || 'free';
        const cube = parts[2] || 'unknown';
        const version = parts[4] || 'v1';
        
        const file = await handle.getFile();

        foundIndexes.push({
          key: name, 
          fileName: name,
          tier,
          cube,
          category: cube,
          version,
          sizeBytes: file.size,
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

export async function loadProject(
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
}

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