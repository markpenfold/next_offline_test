import { NextResponse } from "next/server"
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { r2Client, BUCKET_NAME } from "@/lib/blog/r2"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { accountSlug } = await request.json()

    if (!accountSlug) {
      return NextResponse.json({ error: "Missing accountSlug" }, { status: 400 })
    }

    // 1. Fetch manifest for post titles/metadata
    const manifestKey = `${accountSlug}/manifest.json`
    let manifestMap = new Map<string, { title: string; publishedAt: string }>()

    try {
      const manifestRes = await r2Client.send(
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: manifestKey })
      )
      const str = await manifestRes.Body?.transformToString()
      if (str) {
        const manifestData = JSON.parse(str)
        for (const item of manifestData.posts || []) {
          manifestMap.set(item.slug, { title: item.title, publishedAt: item.publishedAt })
        }
      }
    } catch {
      // Manifest optional fallback
    }

    // 2. Shallow list top-level folders inside <accountSlug>/posts/
    const listRes = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: `${accountSlug}/posts/`,
        Delimiter: "/", // Essential: prevents S3 from scanning inner media/HTML files
      })
    )

    // Extract slug names from folder paths (e.g. "marko-polo/posts/alpha/" -> "alpha")
    const publishedPosts = (listRes.CommonPrefixes || [])
      .map((cp) => {
        if (!cp.Prefix) return null
        const parts = cp.Prefix.replace(/\/$/, "").split("/")
        return parts[parts.length - 1]
      })
      .filter((slug): slug is string => Boolean(slug))
      .map((slug) => {
        const meta = manifestMap.get(slug)
        return {
          slug,
          title: meta?.title || slug,
          publishedAt: meta?.publishedAt || new Date().toISOString(),
        }
      })

    return NextResponse.json({ success: true, posts: publishedPosts })
  } catch (err: any) {
    console.error("Failed to scan R2 post directories:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}