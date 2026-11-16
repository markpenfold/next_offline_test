import { NextResponse } from "next/server"
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { r2Client } from "@/lib/blog/r2"
import { createClient } from "@/lib/supabase/server"
import { BlogPost } from "@/components/blog/blogHelpers" // Assuming BlogPost is accessible here

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  const bucketName = process.env.R2_USERCONTENT_BUCKET_NAME
  if (!bucketName) {
    console.error('R2 Error: R2_USERCONTENT_BUCKET_NAME environment variable is not defined.')
    return NextResponse.json(
      { error: 'Server configuration error: Missing R2_USERCONTENT_BUCKET_NAME.' },
      { status: 500 }
    )
  }

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { accountSlug } = await request.json()

    if (!accountSlug) {
      return NextResponse.json({ error: "Missing accountSlug" }, { status: 400 })
    }

    const accountPrefix = `${accountSlug}`
    const postsPrefix = `${accountPrefix}/posts/`
    const manifestKey = `${accountPrefix}/manifest.json`

    // 1. Fetch manifest to map posts by slug/id
    const manifestMapBySlug = new Map<string, Partial<BlogPost>>()

    try {
      const manifestRes = await r2Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: manifestKey })
      )
      if (manifestRes.Body) {
        const str = await manifestRes.Body.transformToString()
        const manifestData = JSON.parse(str)
        const posts: Partial<BlogPost>[] = manifestData.posts || manifestData || []

        for (const item of posts) {
          const itemSlug = item.slug
          if (itemSlug) {
            manifestMapBySlug.set(itemSlug, item)
          }
        }
      }
    } catch {
      // Manifest optional fallback if missing
    }

    // 2. Shallow list top-level post folders inside user-content/<accountSlug>/posts/
    const listRes = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: postsPrefix,
        Delimiter: "/", 
      })
    )

    // 3. Extract post slugs from R2 prefixes and pair with manifest metadata
    const publishedPosts = (listRes.CommonPrefixes || [])
      .map((cp) => {
        if (!cp.Prefix) return null
        const parts = cp.Prefix.replace(/\/$/, "").split("/")
        return parts[parts.length - 1]
      })
      .filter((slug): slug is string => Boolean(slug))
      .map((slug) => {
        const meta = manifestMapBySlug.get(slug)

        return {
          id: meta?.id || slug,
          postId: meta?.id || slug,
          slug: slug,
          postSlug: slug,
          title: meta?.title || slug.replace(/-/g, " "),
          subTitle: meta?.subTitle || null,
          status: 'published',
          createdAt: meta?.createdAt || new Date().toISOString(),
          dateLastEdited: meta?.dateLastEdited || new Date().toISOString(),
          author: meta?.author || { userId: user.id, accountId: '', accountSlug, name: user.email || 'Author' },
          blobMap: meta?.blobMap || {},
          templateId: meta?.templateId || 'simple-blog',
          heroImage: meta?.heroImage || null,
        }
      })

    return NextResponse.json({ success: true, posts: publishedPosts })
  } catch (err: any) {
    console.error("Failed to scan R2 post directories:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}