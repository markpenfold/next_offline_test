interface PageTemplateParams {
  title: string;
  contentHtml: string;
  accountSlug: string;
  subTitle: string;
  heroImage: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderFullPage({ 
  title, 
  subTitle, 
  heroImage, 
  contentHtml, 
  accountSlug 
}: PageTemplateParams): string {
  const safeTitle = escapeHtml(title);
  const safeSubTitle = subTitle ? escapeHtml(subTitle) : null;
  const safeAccountSlug = escapeHtml(accountSlug);

  const circleIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle preview-icon"><circle cx="12" cy="12" r="10"/></svg>`.trim();

  // Conditional Hero container
  const heroHtml = heroImage
    ? `<div class="post-hero-container">
        <img src="${escapeHtml(heroImage)}" alt="${safeTitle}" class="post-hero-image" />
       </div>`
    : '';

  // Conditional Subtitle container
  const subTitleHtml = safeSubTitle
    ? `<div class="post-subtitle-container">
        <p class="post-subtitle">${safeSubTitle}</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle} - ${safeAccountSlug}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header class="header">
      <div class="header-container">
        <a href="/" class="brand-link">
          ${circleIconSvg}
          <span>${safeAccountSlug}</span>
        </a>
      </div>
    </header>
    
    <div class="layout-grid">
      <main class="main-content">
        <header class="post-header">
          ${heroHtml}
          <div class="post-title-container">
            <h1 class="post-title">${safeTitle}</h1>
          </div>
          ${subTitleHtml}
        </header>

        <article class="prose">
          ${contentHtml}
        </article>
      </main>

      <aside class="sidebar">
        <h3 class="sidebar-title">Recent Posts</h3>
        <ul id="recent-posts-list" class="recent-list">
          <li class="status-text">Loading...</li>
        </ul>
      </aside>
    </div>

    <script>
      (async function loadRecentPosts() {
        var listEl = document.getElementById('recent-posts-list');
        if (!listEl) return;

        try {
          var res = await fetch('/manifest.json');
          if (!res.ok) throw new Error('Status ' + res.status);
          
          var data = await res.json();
          
          if (!data || !Array.isArray(data.posts) || data.posts.length === 0) {
            listEl.innerHTML = '<li class="status-text">No recent posts</li>';
            return;
          }

          var sortedPosts = data.posts.sort(function(a, b) { 
            var dateA = new Date(a.publishedAt || a.createdAt || 0);
            var dateB = new Date(b.publishedAt || b.createdAt || 0);
            return dateB - dateA;
          });

          var recent = sortedPosts.slice(0, 5);
          listEl.innerHTML = '';

          recent.forEach(function(post) {
            var slug = post.postSlug || post.slug || post.id;
            if (!slug) return;

            var li = document.createElement('li');
            var a = document.createElement('a');
            
            a.href = '/' + slug;
            a.className = 'recent-link';
            a.textContent = post.title || 'Untitled';
            
            if (window.location.pathname === '/' + slug) {
              a.setAttribute('aria-current', 'page');
              a.style.fontWeight = '700';
            }

            li.appendChild(a);
            listEl.appendChild(li);
          });
        } catch (err) {
          console.error('Failed to load recent posts:', err);
          listEl.innerHTML = '<li class="status-text">Unable to load posts</li>';
        }
      })();
    </script>
  </body>
  </html>`;
}