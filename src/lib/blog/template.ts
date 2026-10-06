interface PageTemplateParams {
  title: string;
  contentHtml: string;
  accountSlug: string;
  recentPosts?: { slug: string; title: string }[];
}

export function renderFullPage({ title, contentHtml, accountSlug, recentPosts = [] }: PageTemplateParams): string {
  const sidebarLinks = recentPosts
    .map((post) => `<li><a href="/${post.slug}" class="hover:underline">${post.title}</a></li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 font-sans min-h-screen">
  <header class="border-b bg-white py-4 px-6 mb-8 shadow-sm">
    <div class="max-w-5xl mx-auto flex justify-between items-center">
      <a href="/" class="text-xl font-bold tracking-tight">${accountSlug}.omen.land</a>
    </div>
  </header>
  
  <div class="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-8">
    <main class="md:col-span-3 bg-white p-8 rounded-xl shadow-sm border border-slate-100">
      <h1 class="text-4xl font-extrabold tracking-tight mb-6">${title}</h1>
      <article class="prose max-w-none">
        ${contentHtml}
      </article>
    </main>

    <aside class="md:col-span-1 space-y-6">
  <h3 class="font-bold text-slate-500 uppercase tracking-wider text-sm">Recent Posts</h3>
  <ul id="recent-posts-list" class="space-y-2 text-sm">
    <li class="text-slate-400 text-xs">Loading...</li>
  </ul>
</aside>

<script>
  (async function loadRecentPosts() {
    try {
      var res = await fetch('/manifest.json');
      if (!res.ok) throw new Error('HTTP status ' + res.status);
      
      var data = await res.json();
      var listEl = document.getElementById('recent-posts-list');
      
      if (!data || !data.posts || !Array.isArray(data.posts) || data.posts.length === 0) {
        listEl.innerHTML = '<li class="text-slate-400 text-xs">No posts found</li>';
        return;
      }

      // Sort posts by publishedAt date descending
      var sortedPosts = data.posts.sort(function(a, b) { 
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      });

      // Get top 5 recent posts
      var recent = sortedPosts.slice(0, 5);

      // Build DOM elements safely without template literals or HTML slashes
      listEl.innerHTML = '';
      recent.forEach(function(post) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        
        a.href = '/' + post.postSlug;
        a.className = 'text-slate-700 hover:text-slate-900 transition font-medium';
        a.textContent = post.title;
        
        li.appendChild(a);
        listEl.appendChild(li);
      });
    } catch (err) {
      console.error('Failed to load recent posts:', err);
      var container = document.getElementById('recent-posts-list');
      if (container) {
        container.innerHTML = '<li class="text-slate-400 text-xs">Unable to load recent posts</li>';
      }
    }
  })();
</script>
  </div>
</body>
</html>`;
}