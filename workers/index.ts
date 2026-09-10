import { marked } from 'marked';
import fm from 'front-matter';

interface Env {
  USER_CONTENT: R2Bucket;
}

interface FrontmatterAttrs {
  title?: string;
  subtitle?: string;
  date?: string;
  author_name?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const hostname = request.headers.get("host") || "";

    // Extract subdomain (e.g., "second_user" or "marko_polo")
    const accountSlug = hostname.split('.')[0];

    // Extract post slug from pathname (e.g., /heart_stopping -> "heart_stopping")
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    // If visiting root (e.g., second_user.omen.land/), default to an index post or custom fallback
    const postSlug = pathSegments[0] || "index"; 

    // Look up the exact HTML file for this post
    const r2Key = `${accountSlug}/posts/${postSlug}/index.html`;
    const object = await env.USER_CONTENT.get(r2Key);

    if (!object) {
      return new Response(`Post "${postSlug}" not found on ${accountSlug}.omen.land`, { 
        status: 404,
        headers: { "Content-Type": "text/plain" }
      });
    }

    return new Response(object.body, {
      headers: { 
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600"
      },
    });
  },
};