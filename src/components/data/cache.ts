/**
 * Resolves an internal virtual Object URL for heavy engine assets.
 * Checks OPFS first (SSD speed); falls back to downloading and caching from CDN if missing.
 */
export async function getCachedFileBlobUrl(fileName: string, cdnUrl: string): Promise<string> {
    // Gracefully handle Server-Side Rendering checks in Next.js
    if (typeof window === 'undefined') return '';
  
    const root = await navigator.storage.getDirectory();
    
    try {
      const fileHandle = await root.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      console.log(`📦 Engine Cache HIT: Loaded ${fileName} directly from local SSD.`);
      return URL.createObjectURL(file);
    } catch (e) {
      console.log(`🌐 Engine Cache MISS: Downloading ${fileName} from CDN...`);
      const response = await fetch(cdnUrl);
      const blob = await response.blob();
      
      const fileHandle = await root.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      
      return URL.createObjectURL(blob);
    }
  }