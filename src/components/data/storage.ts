/**
 * Utility functions for managing local Parquet shards inside the 
 * Browser's Origin Private File System (OPFS).
 */

/**
 * Scans the root directory of the OPFS storage layer and compiles 
 * a Set of all available filenames.
 */
export async function getLocalCacheManifest(): Promise<Set<string>> {
  try {
    const root = await navigator.storage.getDirectory();
    const existingFiles = new Set<string>();
    
    for await (const entry of root.values()) {
      if (entry.kind === "file") {
        existingFiles.add(entry.name);
      }
    }
    return existingFiles;
  } catch (err) {
    console.error("Failed to read OPFS directory maps:", err);
    return new Set();
  }
}

/**
 * Checks if a specific file name exists in local storage and is not empty.
 */
export async function checkFileExists(fileName: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(fileName);
    const file = await handle.getFile();
    return file.size > 0;
  } catch {
    return false;
  }
}

/**
 * Directly commits a binary Blob into a designated target file slot in OPFS.
 */
export async function writeBlobToOPFS(fileName: string, data: Blob): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

/**
 * 💡 NEW: Orchestrates the cache check, network fetch, and OPFS storage pipeline.
 * Accepts an optional onLog callback to pass string statuses back to the UI.
 */
export async function getShard(
  category: string, 
  bucketName: string, 
  onLog?: (msg: string) => void
): Promise<boolean> {
  const targetFile = `master_category=${category}/era=post_1900.parquet`;
  const safeLocalFileName = `${bucketName}__${category}__post_1900.parquet`;

  // Safely trigger the logging callback if the UI provided one
  const log = (msg: string) => onLog?.(msg);

  log(`🔍 Checking local cache for: "${category}"...`);

  try {
    const fileExists = await checkFileExists(safeLocalFileName);

    if (fileExists) {
      log(`⚡ Cache Hit! "${safeLocalFileName}" is active. Skipping download loop.`);
      return true; // Returns true indicating the file is ready locally
    }

    log(`📡 Cache Miss. Fetching shard from remote R2 bucket...`);
    const response = await fetch(`/api/download?bucket=${bucketName}&file=${encodeURIComponent(targetFile)}`);      
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    log("Streaming dataset binary content across proxy...");
    const blob = await response.blob();
    
    await writeBlobToOPFS(safeLocalFileName, blob);
    log(`🟢 Successfully downloaded and saved: ${safeLocalFileName}`);
    
    return true; 
  } catch (err: any) {
    log(`❌ Process Error: ${err.message}`);
    return false; // Returns false indicating the pipeline failed
  }
}

/**
 * 💡 NEW: Dummy stub for loading a specific shard into DuckDB workspace memory views.
 */
export async function loadShardIntoEngine(
  fileName: string,
  onLog?: (msg: string) => void
): Promise<boolean> {
  const log = (msg: string) => onLog?.(msg);
  log(`⚙️ loadShardIntoEngine called for local target: "${fileName}"`);
  
  // This is where our streamlined in-memory DuckDB registration will wire up next
  return true;
}