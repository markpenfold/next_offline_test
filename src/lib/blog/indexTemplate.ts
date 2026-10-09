import { Contributor, PostCardData, IndexPageParams, escapeHtml } from "@/components/blog/blogHelpers";

function generateMosaicSvg(seedStr: string): string {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }

  const columns = 6;
  const rows = 3;
  const rects: string[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      // Deterministic color generation based on position + post hash
      const hue = Math.abs((hash + (r * 7) + (c * 13)) * 31) % 360;
      const lightness = 20 + (Math.abs((hash + r + c) * 17) % 30); // Keeps colors rich & readable
      const color = `hsl(${hue}, 60%, ${lightness}%)`;

      rects.push(
        `<rect x="${c * 20}" y="${r * 20}" width="20" height="20" fill="${color}" />`
      );
    }
  }

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" preserveAspectRatio="none">${rects.join('')}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}


export function renderIndexPage({
  accountSlug,
  blogTitle,
  blogSubtitle,
  blogHeaderImage,
  contributors,
  initialPosts = [],
}: IndexPageParams): string {
  const safeAccountSlug = escapeHtml(accountSlug);
  const safeBlogTitle = escapeHtml(blogTitle || accountSlug);
  const safeBlogSubtitle = blogSubtitle ? escapeHtml(blogSubtitle) : null;

  const DEFAULT_POST_HERO = '/assets/fallback-hero.webp'
  // Header Banner Image
  const headerImageHtml = blogHeaderImage
    ? `<div class="index-hero-container">
        <img src="${escapeHtml(blogHeaderImage)}" alt="${safeBlogTitle}" class="index-hero-image" />
       </div>`
    : '';

  // Subtitle / Description
  const subtitleHtml = safeBlogSubtitle
    ? `<p class="blog-subtitle">${safeBlogSubtitle}</p>`
    : '';

  // Contributors HTML
  const contributorsHtml = contributors.length > 0
    ? contributors.map((c) => {
        const safeName = escapeHtml(c.name || c.username);
        const safeBio = c.bio ? escapeHtml(c.bio) : '';
        const initials = safeName.slice(0, 2).toUpperCase();
        
        return `
          <div class="contributor-card">
            <div class="contributor-avatar-holder">
              ${c.avatarUrl 
                ? `<img src="${escapeHtml(c.avatarUrl)}" alt="${safeName}" class="contributor-avatar" />` 
                : `<div class="contributor-fallback">${initials}</div>`
              }
            </div>
            <div class="contributor-info">
              <h4 class="contributor-name">${safeName}</h4>
              ${safeBio ? `<p class="contributor-bio">${safeBio}</p>` : ''}
            </div>
          </div>
        `;
      }).join('')
    : '<p class="status-text">No contributors listed</p>';

  // Sort initial posts descending by date for SSR output
  const sortedInitialPosts = [...initialPosts].sort((a, b) => {
    const timeA = new Date(a.publishedAt || 0).getTime();
    const timeB = new Date(b.publishedAt || 0).getTime();
    return timeB - timeA;
  });

  // Initial Posts HTML
  const postsCardsHtml = sortedInitialPosts.length > 0
    ? sortedInitialPosts.map((post) => {
        const safeTitle = escapeHtml(post.title);
        const safeSlug = escapeHtml(post.slug);
        const safeSub = post.subtitle ? escapeHtml(post.subtitle) : '';
         
        // Use actual hero image or generate SVG mosaic fallback
        const heroUrl = post.heroImage 
            ? escapeHtml(post.heroImage) 
            : generateMosaicSvg(post.slug || post.title || 'post');

        const hero = `<div class="card-hero ${!post.heroImage ? 'card-hero-mosaic' : ''}"><img src="${heroUrl}" alt="${safeTitle}" /></div>`;
            
        const dateStr = post.publishedAt 
            ? new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';

        return `
          <article class="post-card">
            <a href="/${safeSlug}" class="card-link-wrapper">
              ${hero}
              <div class="card-content">
                <h3 class="card-title">${safeTitle}</h3>
                ${safeSub ? `<p class="card-subtitle">${safeSub}</p>` : ''}
                <div class="card-meta">
                  <time datetime="${post.publishedAt}">${dateStr}</time>
                  ${post.readingTime ? `<span class="reading-time">• ${escapeHtml(post.readingTime)}</span>` : ''}
                </div>
              </div>
            </a>
          </article>
        `;
      }).join('')
    : '<div class="status-text">No published posts yet.</div>';

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeBlogTitle}</title>
    <link rel="stylesheet" href="/assets/styles.css">
  </head>
  <body>
    <!-- Top 1/3: Header / Hero Section -->
    <header class="index-header">
      ${headerImageHtml}
      <div class="index-branding-container">
        <h1 class="blog-title">${safeBlogTitle}</h1>
        ${subtitleHtml}
      </div>
    </header>

    <div class="index-layout">
      <!-- Contributors Bar -->
      <section class="contributors-section">
        <h2 class="section-title">Contributors</h2>
        <div id="contributors-list" class="contributors-grid">
          ${contributorsHtml}
        </div>
      </section>

      <!-- Main Posts Section -->
      <section class="posts-section">
        <h2 class="section-title">Latest Posts</h2>
        <div id="posts-grid" class="posts-grid">
          ${postsCardsHtml}
        </div>
      </section>
    </div>

    <!-- Client-side Manifest Rehydration -->
    <script>

    function generateMosaicSvgJS(seedStr) {
  var hash = 0;
  for (var i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  var rects = [];
  for (var r = 0; r < 3; r++) {
    for (var c = 0; c < 6; c++) {
      var hue = Math.abs((hash + (r * 7) + (c * 13)) * 31) % 360;
      var lightness = 20 + (Math.abs((hash + r + c) * 17) % 30);
      rects.push('<rect x="' + (c * 20) + '" y="' + (r * 20) + '" width="20" height="20" fill="hsl(' + hue + ', 60%, ' + lightness + '%)" />');
    }
  }
  return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" preserveAspectRatio="none">' + rects.join('') + '</svg>');
}


      (async function syncWithManifest() {
        var postsGridEl = document.getElementById('posts-grid');
        if (!postsGridEl) return;

        function escapeStr(str) {
          if (!str) return '';
          return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        }

        try {
          var res = await fetch('/manifest.json');
          if (!res.ok) return;

          var data = await res.json();
          if (!data || !Array.isArray(data.posts)) return;

          var sortedPosts = data.posts.sort(function(a, b) { 
            var dateA = new Date(a.publishedAt || a.createdAt || 0);
            var dateB = new Date(b.publishedAt || b.createdAt || 0);
            return dateB - dateA;
          });

          if (sortedPosts.length === 0) {
            postsGridEl.innerHTML = '<div class="status-text">No published posts yet.</div>';
            return;
          }

          postsGridEl.innerHTML = sortedPosts.map(function(post) {
            var slug = escapeStr(post.postSlug || post.slug || post.id);
            var title = escapeStr(post.title || 'Untitled');
            var subtitle = escapeStr(post.subTitle || post.subtitle || '');
            
            
            var isFallback = !post.heroImage;
            // Call generateMosaicSvgJS when post.heroImage is missing
            var heroUrl = post.heroImage ? escapeStr(post.heroImage) : generateMosaicSvgJS(slug || title);

            var hero = '<div class="card-hero ' + (isFallback ? 'card-hero-mosaic' : '') + '">' +
                '<img src="' + heroUrl + '" alt="' + title + '" />' +
            '</div>';
            
            var dateStr = post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

            return '<article class="post-card">' +
              '<a href="/' + slug + '" class="card-link-wrapper">' +
                hero +
                '<div class="card-content">' +
                  '<h3 class="card-title">' + title + '</h3>' +
                  (subtitle ? '<p class="card-subtitle">' + subtitle + '</p>' : '') +
                  '<div class="card-meta">' +
                    '<time datetime="' + escapeStr(post.publishedAt || '') + '">' + dateStr + '</time>' +
                  '</div>' +
                '</div>' +
              '</a>' +
            '</article>';
          }).join('');

        } catch (err) {
          console.error('Failed to sync index with manifest:', err);
        }
      })();
    </script>
  </body>
  </html>`;
}