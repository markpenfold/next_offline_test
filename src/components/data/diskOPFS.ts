import { AvailableIndex, OPFSDirectory, ProjectConfig } from "@/components/data/dataTypes"

/**
 * Get or create a specific directory or deeply nested subdirectory handle in OPFS
 * Supports single folders ("indexes") or relative paths ("savedProjects/acc_123")
 */
export async function getDirectory(dirName: string): Promise<FileSystemDirectoryHandle> {
  let currentHandle = await navigator.storage.getDirectory();
  
  // Strip leading/trailing slashes and split path into segments
  const segments = dirName.split("/").filter((s) => s.length > 0);

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment, { create: true });
  }

  return currentHandle;
}

/**
 * Save data into a specific OPFS directory or nested path tracking block
 * Encapsulates the Atomic Transaction Abort sequence to protect against file corruption
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
    
    // 1. Acquire Lock
    writable = await fileHandle.createWritable();
    
    // 2. Write Data
    await writable.write(data);
    
    // 3. Commit & Defuse Lock
    await writable.close();
    writable = null; 

    console.log(`💾 Saved to OPFS: /${dirName}/${fileName}`);
    return `${dirName}/${fileName}`;
    
  } catch (err) {
    console.error(`❌ OPFS Write Error [/${dirName}/${fileName}]:`, err);
    
    // 4. Abort Transaction on Failure
    if (writable) {
      try {
        await writable.abort();
      } catch (abortErr) {
        console.error(`🚨 Fatal: Failed to abort writable stream [/${dirName}/${fileName}]:`, abortErr);
      }
    }
    
    throw err; 
  }
}

/**
 * Universal Reader primitive leveraging stable file snapshots
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

/**
 * List all filenames currently stored inside a specific OPFS folder
 */
export async function listOPFSFolder(dirName: string): Promise<Set<string>> {
  try {
    const dirHandle = await getDirectory(dirName);
    const files = new Set<string>();

    const keysIterator = dirHandle.keys() as AsyncIterable<string>;
    for await (const name of keysIterator) {
      files.add(name);
    }
    return files;
  } catch (err) {
    return new Set(); // Folder doesn't exist yet or is empty
  }
}

/**
 * Returns a set of filenames found in the given directory mapping
 */
export async function getLocalCacheManifest(dirName: "indexes" | "data" = "data"): Promise<Set<string>> {
  try {
    const entries = await getOPFSEntries(dirName);
    const existingFiles = new Set<string>();
    
    for (const entry of entries) {
      existingFiles.add(entry.name);
    }
    
    console.log(`📂 Get local cache manifest for /${dirName} ->`, existingFiles);
    return existingFiles;
  } catch (err) {
    console.error(`❌ Failed to read OPFS directory maps for /${dirName}:`, err);
    return new Set();
  }
}

/**
 * Returns all (name + file handle) in a specified OPFS folder path cleanly
 */
export async function getOPFSEntries(dirName: string): Promise<Array<{ name: string; handle: FileSystemFileHandle }>> {
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

/**
 * Checks if a specific file exists within an OPFS subdirectory path
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
 * Deep-path traversal navigation tool preserved for explicit handling continuity
 */
export async function getSubdirectoryHandle(dirPath: string): Promise<FileSystemDirectoryHandle> {
  return getDirectory(dirPath);
}

// Scans local OPFS index files, extracting schemas and assembling valid analytical shards
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
        const era = parts[3] || 'unknown';
        const version = parts[4] || 'v1';
        
        const file = await handle.getFile();

        foundIndexes.push({
          key: name, 
          fileName: name,
          tier,
          cube,
          era,
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

// Safely removes an entry target from an explicit storage path
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


// Purges and cleanly reinstantiates a specific tracking folder path
export async function wipeOPFSFolder(dirName: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(dirName, { recursive: true });
    
    // Instantly preserve future write operations by generating an empty node context
    await getDirectory(dirName);
    
    console.log(`🧹 OPFS directory /${dirName} wiped clean!`);
    return true;
  } catch (err) {
    console.log(`Directory /${dirName} was already empty or didn't exist.`);
    return false;
  }
}

/** 
 * Load a specific configuration file routing directly through readFromOPFSFolder
 * Aligned with the canonical layout specification path: savedProjects/{accountId}/{projectName}.json
 */
export async function loadProject(accountId: string, projectName: string): Promise<ProjectConfig | null> {
  try {
    const dirPath = `savedProjects/${accountId}`;
    const fileName = projectName.endsWith('.json') ? projectName : `${projectName}.json`;
    
    // Prevent noisy console errors during fresh-boot fallbacks
    const hasProject = await checkFileExists(dirPath, fileName);
    if (!hasProject) return null;

    const text = await readFromOPFSFolder(dirPath, fileName, 'text') as string;
    return JSON.parse(text) as ProjectConfig;
  } catch (err) {
    return null;
  }
}

/** 
 * Save a configuration profile, pre-serializing data and routing through saveToOPFSFolder
 * Aligned with the canonical layout specification path: savedProjects/{accountId}/{projectName}.json
 */
export async function saveProject(
  accountId: string, 
  projectName: string, 
  config: Omit<ProjectConfig, 'updatedAt'>
): Promise<boolean> {
  try {
    // Pre-serialization guard: catch memory or circular failures safely before calling disk storage
    const payload: ProjectConfig = {
      ...config,
      updatedAt: new Date().toISOString()
    };
    const serializedData = JSON.stringify(payload, null, 2);

    const dirPath = `savedProjects/${accountId}`;
    const fileName = projectName.endsWith('.json') ? projectName : `${projectName}.json`;
    
    await saveToOPFSFolder(dirPath, fileName, serializedData);
    return true;
  } catch (err) {
    console.error(`❌ Failed to write project layout data for ${projectName}:`, err);
    return false;
  }
}

/** 
 * Persists active working context records directly through saveToOPFSFolder 
 */
export async function saveSession(accountId: string, projectName: string | null): Promise<void> {
  try {
    const serializedSession = JSON.stringify({ activeProject: projectName });
    await saveToOPFSFolder(`savedProjects/${accountId}`, 'session.json', serializedSession);
  } catch (err) {
    console.error(`❌ Failed to commit session context snapshot:`, err);
  }
}

/** 
 * Retrieves active session track history directly via readFromOPFSFolder
 */
export async function readSession(accountId: string): Promise<string | null> {
  try {
    const dirPath = `savedProjects/${accountId}`;
    
    // Quietly catch cold-starts before the reader throws console errors
    const hasSession = await checkFileExists(dirPath, 'session.json');
    if (!hasSession) return null;

    const text = await readFromOPFSFolder(dirPath, 'session.json', 'text') as string;
    const { activeProject } = JSON.parse(text);
    return activeProject;
  } catch (err) {
    return null; 
  }
}

/**
 * Returns saved workspace models and tracking profiles for an isolated account 
 */
export async function getSavedProjects(accountId: string): Promise<Array<{ name: string; handle: FileSystemFileHandle }>> {
  try {
    const dirPath = `savedProjects/${accountId}`;
    const entries = await getOPFSEntries(dirPath);

    // Isolate pure configuration models cleanly while stripping away local dynamic tracks
    return entries.filter(({ name }) => name.endsWith('.json') && name !== 'session.json');
  } catch (err) {
    console.error(`Failed to scan OPFS savedProjects indices for account ${accountId}:`, err);
    return [];
  }
}