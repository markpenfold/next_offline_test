// Helper function to determine the correct Content-Type header based on file extension
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(request, env) {
    // 1. Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    const url = new URL(request.url);
    const hostname = request.headers.get("host") || url.hostname;

    // Extract the account slug from the subdomain (e.g., "bibbsy-times" from "bibbsy-times.omen.land")
    const accountSlug = hostname.split('.')[0];
    let path = url.pathname;

    // Clean up trailing slashes
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    // Strip legacy /posts prefix if present in the URL path
    if (path.startsWith('/posts/')) {
      path = path.replace('/posts', '');
    }

    // Identify if the request is for a top-level global asset (avatars, styles, favicons, etc.)
    const isGlobalAsset = 
      path === '/styles.css' || 
      path === '/favicon.ico' || 
      path.startsWith('/assets/') ||
      path.startsWith('/user-avatars/');

    let r2Key;

    if (isGlobalAsset) {
      // Global assets map directly to their top-level paths
      r2Key = path.startsWith('/') ? path.slice(1) : path;
    } else if (path === '/' || path === '' || path === '/index.html') {
      // Root blog landing page
      r2Key = `${accountSlug}/index.html`;
    } else if (path === '/manifest.json') {
      // Blog post manifest file
      r2Key = `${accountSlug}/manifest.json`;
    } else {
      // 2. PARSE POST SLUGS & ASSET SUBPATHS (e.g., /fluffy-this-n-that or /fluffy-this-n-that/media/hero.webp)
      const segments = path.split('/').filter(Boolean);
      const slugOrAsset = segments[0]; // This is "fluffy-this-n-that"

      let targetFolder = null;

      // If it looks like a post slug (no file extension like .css or .ico), we must resolve its UUID postId
      if (slugOrAsset && !slugOrAsset.includes('.')) {
        try {
          // Fetch the account's manifest.json from R2 to lookup the mapping
          const manifestObj = await env.USER_CONTENT.get(`${accountSlug}/manifest.json`);
          if (manifestObj) {
            const manifestData = await manifestObj.json();
            const posts = Array.isArray(manifestData) ? manifestData : (manifestData.posts || []);
            
            // Find the post entry where the slug matches what the browser requested
            const matchedPost = posts.find(p => p.slug === slugOrAsset || p.id === slugOrAsset);
            
            if (matchedPost && matchedPost.id) {
              // TRANSLATION SUCCESSFUL: Swap the human-readable slug for the immutable UUID postId folder!
              // e.g., "fluffy-this-n-that" becomes "40d2800a-c40a-4673-9fc3-f63ef104e848"
              targetFolder = matchedPost.id;
            }
          }
        } catch (err) {
          console.error("Failed to map slug to postId via manifest:", err);
        }

        // 3. REBUILD THE R2 KEY USING THE RESOLVED POST ID FOLDER
        if (targetFolder) {
          // Grab any subpaths after the slug (e.g. ["media", "1794825910988-9yj9b7.webp"])
          const subPathSegments = segments.slice(1);
          const subPath = subPathSegments.length > 0 ? `/${subPathSegments.join('/')}` : '';

          // Construct the final physical R2 storage key:
          // Format: {accountSlug}/posts/{postId}{subPath}
          // For the hero image, this evaluates to:
          // "bibbsy-times/posts/40d2800a-c40a-4673-9fc3-f63ef104e848/media/1794825910988-9yj9b7.webp"
          r2Key = `${accountSlug}/posts/${targetFolder}${subPath}`;

          // If the request was just for the post page itself (no extension like .webp), append /index.html
          if (!r2Key.includes('.')) {
            r2Key += '/index.html';
          }
        }
      }
    }

    // 4. FETCH FROM R2 USING THE CONSTRUCTED KEY
    let object = r2Key ? await env.USER_CONTENT.get(r2Key) : null;

    // If the file doesn't exist in R2, throw a clean 404 showing exactly what key was looked up
    if (!object) {
      return new Response(`404 Not Found: "${r2Key || path}" does not exist in R2`, { 
        status: 404, 
        headers: { 
          "Content-Type": "text/plain; charset=utf-8",
          ...corsHeaders,
        } 
      });
    }

    // Set caching headers based on file type
    const isHtmlOrJson = r2Key.endsWith('.html') || r2Key.endsWith('.json');
    const cacheControl = isHtmlOrJson
      ? "public, max-age=0, must-revalidate"
      : "public, max-age=31536000, immutable";

    return new Response(object.body, {
      headers: { 
        "Content-Type": getContentType(r2Key),
        "Cache-Control": cacheControl,
        ...corsHeaders,
      },
    });
  },
};