import {AvailableIndex, OPFSDirectory, ProjectConfig} from "@/components/data/dataTypes"



/**
 * Get or create a specific subdirectory handle in OPFS
 */
export async function getDirectory(dirName: OPFSDirectory): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle(dirName, { create: true });
}

/**
 * Save an ArrayBuffer into a specific OPFS subdirectory (/indexes or /data)
 */
export async function saveToOPFSFolder(
  dirName: OPFSDirectory,
  fileName: string,
  data: ArrayBuffer
): Promise<string> {
  const dirHandle = await getDirectory(dirName);
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();

  console.log(`💾 Saved to OPFS: /${dirName}/${fileName}`);
  return `${dirName}/${fileName}`;
}

/**
 * List all filenames currently stored inside a specific OPFS folder
 */
export async function listOPFSFolder(dirName: OPFSDirectory): Promise<Set<string>> {
  try {
    const dirHandle = await getDirectory(dirName);
    const files = new Set<string>();

    for await (const name of dirHandle.keys()) {
      files.add(name); // ✅ Simple, direct Set addition
    }

    return files;
  } catch (err) {
    return new Set(); // Folder doesn't exist yet
  }
}

// Returns a set of filenames found in the given directory //////////////////////////////////////////////
export async function getLocalCacheManifest(dirName: "indexes" | "data" = "data"): Promise<Set<string>> {
  try {
    const entries = await getOPFSEntries(dirName);
    const existingFiles = new Set<string>();
    
    for (const entry of entries) {
      console.log("FOUUUUUUUUUOUND: ", entry.name)
      existingFiles.add(entry.name);
    }
    
    console.log(`📂 Get local cache manifest for /${dirName} ->`, existingFiles);
    return existingFiles;
  } catch (err) {
    console.error(`❌ Failed to read OPFS directory maps for /${dirName}:`, err);
    return new Set();
  }
}




// Returns all (name + file handle) in a specified OPFS folder
export async function getOPFSEntries(dirName: OPFSDirectory): Promise<Array<{ name: string; handle: FileSystemFileHandle }>> {
  try {
    const dirHandle = await getDirectory(dirName);
    const entries: Array<{ name: string; handle: FileSystemFileHandle }> = [];

    // @ts-ignore - TS async iterable handling
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === "file") {
        entries.push({ name, handle: handle as FileSystemFileHandle });
      }
    }

    return entries;
  } catch (err) {
    return [];
  }
}



/**Checks if a specific file exists within an OPFS subdirectory*/
export async function checkFileExists(dirName: "indexes" | "data", fileName: string): Promise<boolean> {
  try {
    const dirHandle = await getDirectory(dirName);
    await dirHandle.getFileHandle(fileName, { create: false });
    return true;
  } catch {
    return false;
  }
}


// Helper to navigate down relative folder paths in OPFS
export async function getSubdirectoryHandle(
  dirPath: string
): Promise<FileSystemDirectoryHandle> {
  let currentHandle = await navigator.storage.getDirectory();

  // Strip leading/trailing slashes and split path into segments
  const segments = dirPath.split("/").filter((s) => s.length > 0);

  for (const segment of segments) {
    currentHandle = await currentHandle.getDirectoryHandle(segment);
  }

  return currentHandle;
}

export async function getLocalOPFSIndexes(onLog?: (msg: string) => void): Promise<AvailableIndex[]> {
  const log = (msg: string) => onLog?.(msg);
  const foundIndexes: AvailableIndex[] = [];

  try {
    // 🎯 Use OPFS manager helper to fetch entries directly from /indexes
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
          key: name, // Unique string key identifier for local OPFS files
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

/** Save a configuration file into the account's subdirectory */
export async function saveProject(
  accountId: string, 
  projectName: string, // e.g., "autosave.json" or "my_analytics.json"
  config: Omit<ProjectConfig, 'updatedAt'>
): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const savedProjectsHandle = await root.getDirectoryHandle('projects', { create: true });
    const accountHandle = await savedProjectsHandle.getDirectoryHandle(accountId, { create: true });
    
    // Ensure filename ends with .json safely
    const fileName = projectName.endsWith('.json') ? projectName : `${projectName}.json`;
    const fileHandle = await accountHandle.getFileHandle(fileName, { create: true });
    
    const payload: ProjectConfig = {
      ...config,
      updatedAt: new Date().toISOString()
    };

    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return true;
  } catch (err) {
    console.error(`❌ Failed to save project ${projectName} for account ${accountId}:`, err);
    return false;
  }
}

/**
 * Returns all saved project files (and their handles) for a specific account.
 * Path: savedProjects / {accountId} / *.json
 */
export async function getSavedProjects(accountId: string): Promise<Array<{ name: string; handle: FileSystemFileHandle }>> {
  try {
    const root = await navigator.storage.getDirectory();
    
    // 1. Get/Create the top-level savedProjects directory
    const savedProjectsHandle = await root.getDirectoryHandle('projects', { create: true });
    
    // 2. Get/Create the account-specific subdirectory
    const accountHandle = await savedProjectsHandle.getDirectoryHandle(accountId, { create: true });

    const entries: Array<{ name: string; handle: FileSystemFileHandle }> = [];

    // @ts-ignore - TS async iterable handling
    for await (const [name, handle] of accountHandle.entries()) {
      // Only return files (ignore stray subdirectories) and ideally just .json
      if (handle.kind === "file" && name.endsWith('.json')) {
        entries.push({ name, handle: handle as FileSystemFileHandle });
      }
    }

    return entries;
  } catch (err) {
    console.error(`Failed to scan OPFS savedProjects for account ${accountId}:`, err);
    return [];
  }
}


export async function deleteOPFSFile(dirName: OPFSDirectory, fileName: string): Promise<boolean> {
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

export async function wipeOPFSFolder(dirName: OPFSDirectory): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(dirName, { recursive: true });
    
    // Re-create the empty directory immediately so handles remain valid
    await root.getDirectoryHandle(dirName, { create: true });
    
    console.log(`🧹 OPFS directory /${dirName} wiped clean!`);
    return true;
  } catch (err) {
    console.log(`Directory /${dirName} was already empty or didn't exist.`);
    return false;
  }
}


/** Load a specific configuration file from the account's subdirectory */
export async function loadProject(accountId: string, projectName: string): Promise<ProjectConfig | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const savedProjectsHandle = await root.getDirectoryHandle('projects', { create: false });
    const accountHandle = await savedProjectsHandle.getDirectoryHandle(accountId, { create: false });
    
    const fileName = projectName.endsWith('.json') ? projectName : `${projectName}.json`;
    const fileHandle = await accountHandle.getFileHandle(fileName, { create: false });
    
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as ProjectConfig;
  } catch (err: any) {
    if (err.name !== 'NotFoundError') {
      console.error(`❌ Failed to load project ${projectName} for account ${accountId}:`, err);
    }
    return null;
  }
}

// @/db/opfsStorage.ts

/** Persists the name of the currently active project to disk */
export async function saveSession(accountId: string, projectName: string | null): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const savedProjectsHandle = await root.getDirectoryHandle('savedProjects', { create: true });
  const accountHandle = await savedProjectsHandle.getDirectoryHandle(accountId, { create: true });
  
  const fileHandle = await accountHandle.getFileHandle('session.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify({ activeProject: projectName }));
  await writable.close();
}

/** Retrieves the name of the project that was open last session */
export async function readSession(accountId: string): Promise<string | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const savedProjectsHandle = await root.getDirectoryHandle('savedProjects', { create: false });
    const accountHandle = await savedProjectsHandle.getDirectoryHandle(accountId, { create: false });
    const fileHandle = await accountHandle.getFileHandle('session.json', { create: false });
    
    const file = await fileHandle.getFile();
    const text = await file.text();
    const { activeProject } = JSON.parse(text);
    return activeProject;
  } catch (err) {
    return null; // No session file exists yet
  }
}