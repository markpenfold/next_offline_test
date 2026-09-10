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
  <title>${title} | ${accountSlug}</title>
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
      <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h2 class="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Recent Posts</h2>
        <ul class="space-y-2 text-sm text-slate-700">
          ${sidebarLinks || '<li class="text-slate-400 italic">No other posts yet.</li>'}
        </ul>
      </div>
    </aside>
  </div>
</body>
</html>`;
}