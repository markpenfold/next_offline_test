export interface Env {
  USER_CONTENT: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname; // e.g. marko-polo.omen.land

    const parts = hostname.split('.');
    
    // Safety check for subdomain parts
    if (parts.length < 3) {
      return new Response('Invalid subdomain', { status: 400 });
    }

    const accountSlug = parts[0]; // "marko-polo"
    let path = url.pathname;

    if (path === '/' || path === '') {
      path = '/index.html';
    }

    // Try primary key mapping: marko-polo/posts/...
    let r2Key = `${accountSlug}/posts${path}`;
    
    if (!path.includes('.') && !path.endsWith('/index.html')) {
      r2Key = `${accountSlug}/posts${path}/index.html`;
    }

    let object = await env.USER_CONTENT.get(r2Key);

    // Fallback try exact raw path
    if (!object) {
      object = await env.USER_CONTENT.get(`${accountSlug}/posts${path}`);
    }

    if (!object) {
      return new Response('404 Not Found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=3600');

    return new Response(object.body, { headers });
  },
};