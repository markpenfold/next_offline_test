import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Client } from '@/lib/blog/r2'
import { renderIndexPage } from '@/lib/blog/indexTemplate'
import { getPublishingContributors } from '@/lib/supabase/queries'
import { ManifestPost, PostCardData } from "@/components/blog/blogHelpers";
import { createAdminClient } from '@/lib/supabase/admin'

export async function rebuildBlogIndex(
  _userSupabase: any, // Kept for backwards compatibility if needed, but admin client overrides
  accountSlug: string, 
  accountId: string
) {
  const bucketName = process.env.R2_USERCONTENT_BUCKET_NAME
  if (!bucketName) {
    throw new Error('Server configuration error: Missing R2_USERCONTENT_BUCKET_NAME.')
  }

  // 1. Create elevated Supabase admin client to bypass RLS
  const supabaseAdmin = await createAdminClient()

    // Fetch account details (temporarily avoiding blog_header_image column lookup until DB migration)
    const { data: account, error: accountError } = await supabaseAdmin
    .from('accounts')
    .select('id, blog_title, blog_subtitle, blog_header_image')
    .eq('id', accountId)
    .single()

    if (accountError || !account) {
    console.error('❌ Supabase Admin Account Query Error:', accountError)
    throw new Error(`Account non-existent or query error for accountId: ${accountId}`)
    }

  // 3. Fetch publishing contributors
  const contributors = await getPublishingContributors(account.id)

  // 4. Read manifest.json & scan R2 directories
  const postsPrefix = `${accountSlug}/posts/`
  const manifestKey = `${accountSlug}/manifest.json`
  const manifestMapBySlug = new Map<string, ManifestPost>()

  try {
    const manifestRes = await r2Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: manifestKey })
    )
    if (manifestRes.Body) {
      const str = await manifestRes.Body.transformToString()
      const manifestData = JSON.parse(str)
      const rawPosts: ManifestPost[] = manifestData.posts || manifestData || []

      for (const item of rawPosts) {
        if (item.postSlug) {
          manifestMapBySlug.set(item.postSlug, item)
        }
      }
    }
  } catch {
    // Optional fallback if manifest is missing
  }

  // List shallow top-level post directories from R2
  const listRes = await r2Client.send(
    new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: postsPrefix,
      Delimiter: '/',
    })
  )

  const publishedPosts: PostCardData[] = (listRes.CommonPrefixes || [])
    .map((cp) => {
      if (!cp.Prefix) return null
      const parts = cp.Prefix.replace(/\/$/, '').split('/')
      return parts[parts.length - 1]
    })
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => {
      const meta = manifestMapBySlug.get(slug)
      return {
        slug: slug,
        title: meta?.title || slug.replace(/-/g, ' '),
        subtitle: meta?.subTitle || null,
        heroImage: meta?.heroImage || null,
        publishedAt: meta?.publishedAt || new Date().toISOString(),
      }
    })

  // 5. Render index template HTML string
const indexHtml = renderIndexPage({
  accountSlug,
  blogTitle: account.blog_title || accountSlug,
  blogSubtitle: account.blog_subtitle || null,
  contributors,
  initialPosts: publishedPosts,
  blogHeaderImage: account.blog_header_image || null,
})

  // 6. Save generated index.html to account root in R2
  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: `${accountSlug}/index.html`,
      Body: indexHtml,
      ContentType: 'text/html',
      CacheControl: 'public, max-age=60',
    })
  )
}