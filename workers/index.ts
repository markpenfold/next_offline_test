interface Env {
  USER_CONTENT: R2Bucket;
}

function getContentType(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js')) return 'application/javascript';
  return 'application/octet-stream';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = request.headers.get("host") || url.hostname;

    const accountSlug = hostname.split('.')[0];
    let path = url.pathname;

    // Strip leading /posts if present
    if (path.startsWith('/posts/')) {
      path = path.replace('/posts', '');
    }

    const isStaticAsset = path.includes('.');

    // Build the expected R2 key
    let r2Key = isStaticAsset 
      ? `${accountSlug}/posts${path}`
      : `${accountSlug}/posts${path.endsWith('/') ? path.slice(0, -1) : path}/index.html`;

    let object = await env.USER_CONTENT.get(r2Key);

    // If static asset fails, NEVER fall through to HTML
    if (!object && isStaticAsset) {
      return new Response(`404 Asset Not Found: Expected R2 Key "${r2Key}"`, { 
        status: 404, 
        headers: { "Content-Type": "text/plain" } 
      });
    }

    // HTML Fallback for routes
    if (!object) {
      r2Key = `${accountSlug}/posts/index.html`;
      object = await env.USER_CONTENT.get(r2Key);
    }

    if (!object) {
      return new Response(`404 Page Not Found`, { status: 404 });
    }

    return new Response(object.body, {
      headers: { 
        "Content-Type": getContentType(r2Key),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  },
};