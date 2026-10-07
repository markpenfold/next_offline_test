interface Env {
  USER_CONTENT: R2Bucket;
}

function getContentType(path: string): string {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = request.headers.get("host") || url.hostname;

    const accountSlug = hostname.split('.')[0];
    let path = url.pathname;

    // Strip leading /posts if present in the URL
    if (path.startsWith('/posts/')) {
      path = path.replace('/posts', '');
    }

    // List of top-level paths that live inside the global /assets folder
    const isGlobalAsset = path === '/styles.css' || path === '/favicon.ico' || path.startsWith('/assets/');

    let r2Key: string;

    if (isGlobalAsset) {
      // Maps /styles.css -> assets/styles.css
      // Maps /assets/logo.png -> assets/logo.png
      r2Key = path.startsWith('/assets/') 
        ? path.slice(1) 
        : `assets${path}`;
    } else {
      // User-specific assets and routes (e.g., "marko-polo/posts/manifest.json")
      const hasExtension = path.includes('.');
      r2Key = hasExtension
        ? `${accountSlug}/posts${path}`
        : `${accountSlug}/posts${path.endsWith('/') ? path.slice(0, -1) : path}/index.html`;
    }

    let object = await env.USER_CONTENT.get(r2Key);

    // 404 handling if missing from R2
    if (!object) {
      return new Response(`404 Not Found: "${r2Key}" does not exist in R2`, { 
        status: 404, 
        headers: { "Content-Type": "text/plain; charset=utf-8" } 
      });
    }

    // Cache strategy: instant revalidation for HTML/JSON, long-term CDN caching for CSS/images
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