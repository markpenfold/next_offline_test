function getContentType(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
  return 'application/octet-stream';
}

// index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = request.headers.get("host") || url.hostname;

    const accountSlug = hostname.split('.')[0];
    let path = url.pathname;

    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    if (path.startsWith('/posts/')) {
      path = path.replace('/posts', '');
    }

    // Treat /user-avatars as a top-level global asset path
    const isGlobalAsset = 
      path === '/styles.css' || 
      path === '/favicon.ico' || 
      path.startsWith('/assets/') ||
      path.startsWith('/user-avatars/');

    let r2Key;

    if (isGlobalAsset) {
      // Maps /user-avatars/uuid/avatar.webp directly to key: user-avatars/uuid/avatar.webp
      r2Key = path.startsWith('/') ? path.slice(1) : path;
    } else if (path === '/' || path === '' || path === '/index.html') {
      r2Key = `${accountSlug}/index.html`;
    } else if (path === '/manifest.json') {
      r2Key = `${accountSlug}/posts/manifest.json`;
    } else {
      const hasExtension = path.includes('.');
      r2Key = hasExtension
        ? `${accountSlug}/posts${path}`
        : `${accountSlug}/posts${path}/index.html`;
    }

    let object = await env.USER_CONTENT.get(r2Key);

    if (!object && !isGlobalAsset && !r2Key.startsWith(`${accountSlug}/index.html`)) {
      const fallbackKey = `${accountSlug}${path}`;
      object = await env.USER_CONTENT.get(fallbackKey);
    }

    if (!object) {
      return new Response(`404 Not Found: "${r2Key}" does not exist in R2`, { 
        status: 404, 
        headers: { "Content-Type": "text/plain; charset=utf-8" } 
      });
    }

    const isHtmlOrJson = r2Key.endsWith('.html') || r2Key.endsWith('.json');
    const cacheControl = isHtmlOrJson
      ? "public, max-age=0, must-revalidate"
      : "public, max-age=31536000, immutable";

    return new Response(object.body, {
      headers: { 
        "Content-Type": getContentType(r2Key),
        "Cache-Control": cacheControl,
      },
    });
  },
};