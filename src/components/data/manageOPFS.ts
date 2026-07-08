type OPFSDirectory = "indexes" | "data";

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
/**
 * Delete a single file from a specific folder
 */
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

/**
 * Safely wipe ONLY a specific directory (/indexes OR /data)
 * Leaves root files (like local databases) completely untouched!
 */
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


/**
 * Returns all file entries (name + file handle) in a specified OPFS folder
 */
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