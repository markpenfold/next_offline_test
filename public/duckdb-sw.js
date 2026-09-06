const DATABASE_DIR = 'database';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname === 'extensions.duckdb.org' && url.pathname.endsWith('.duckdb_extension.wasm')) {
    event.respondWith(serveExtensionFromOPFS(event.request, url));
  }
});

async function serveExtensionFromOPFS(request, url) {
  const fileName = url.pathname.split('/').pop();
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(DATABASE_DIR, { create: true });

  try {
    const handle = await dir.getFileHandle(fileName, { create: false });
    const file = await handle.getFile();
    if (file.size > 0) return new Response(file, { headers: { 'Content-Type': 'application/wasm' } });
  } catch {
    // not cached yet, fall through
  }

  const response = await fetch(request);
  const buffer = await response.clone().arrayBuffer();
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(buffer);
  await writable.close();
  return response;
}