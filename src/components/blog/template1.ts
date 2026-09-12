// src/components/blog/template1.ts

export interface RecentPost {
  slug: string;
  title: string;
  publishedAt: string;
}

export interface TemplateOptions {
  title: string;
  contentHtml: string;
  accountSlug: string;
  recentPosts?: RecentPost[];
}

export function renderFullPage({ 
  title, 
  contentHtml, 
  accountSlug, 
  recentPosts = [] 
}: TemplateOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | ${accountSlug}</title>
  <style>
    :root { --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { font-family: var(--font-sans); line-height: 1.6; max-width: 720px; margin: 0 auto; padding: 2rem 1rem; color: #111; }
    h1 { font-size: 2.25rem; margin-bottom: 0.5rem; letter-spacing: -0.02em; }
    article img { max-width: 100%; height: auto; border-radius: 8px; }
    article blockquote { border-left: 4px solid #eaeaea; margin: 0; padding-left: 1rem; color: #666; }
    nav.recent-posts { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <header>
    <small><strong>${accountSlug.toUpperCase()}</strong></small>
  </header>
  
  <main>
    <article>
      <h1>${title}</h1>
      <div>${contentHtml}</div>
    </article>
  </main>

  ${recentPosts.length > 0 ? `
  <nav class="recent-posts">
    <h3>More Articles</h3>
    <ul>
      ${recentPosts.map(p => `<li><a href="/${p.slug}">${p.title}</a></li>`).join('')}
    </ul>
  </nav>
  ` : ''}
</body>
</html>`;
}