import { NextResponse } from "next/server"
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { r2Client } from "@/lib/blog/r2"
import { createClient } from "@/lib/supabase/server"
import { ManifestPost } from "@/components/blog/blogHelpers";

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
    //console.log("looking for ", accountSlug)
    const accountPrefix = `${accountSlug}`
    const postsPrefix = `${accountPrefix}/posts/`
    const manifestKey = `${accountPrefix}/manifest.json`

    // 1. Fetch manifest to map posts by slug
    const manifestMapBySlug = new Map<string, ManifestPost>()

    try {
      const manifestRes = await r2Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: manifestKey })
      )
      if (manifestRes.Body) {
        
        const str = await manifestRes.Body.transformToString()
        const manifestData = JSON.parse(str)
        //console.log("MANIFEST:", manifestData)
        const posts: ManifestPost[] = manifestData.posts || manifestData || []
        //console.log("POSTS: ", posts)

        for (const item of posts) {
          const itemSlug = item.postSlug
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
        Delimiter: "/", // Delimiter prevents scanning inner media/HTML files
      })
    )

    // 3. Extract post slugs from R2 prefixes and pair with manifest metadata
    const publishedPosts = (listRes.CommonPrefixes || [])
      .map((cp) => {
        if (!cp.Prefix) return null
        // e.g. "user-content/marko-polo/posts/alpha/" -> "alpha"
        const parts = cp.Prefix.replace(/\/$/, "").split("/")
        return parts[parts.length - 1]
      })
      .filter((slug): slug is string => Boolean(slug))
      .map((slug) => {
        const meta = manifestMapBySlug.get(slug)

        return {
          id: meta?.id || slug, // Permanent UUID from manifest (fallback to slug if missing)
          slug: slug,           // Public URL slug
          title: meta?.title || slug.replace(/-/g, " "),
          publishedAt: meta?.publishedAt || new Date().toISOString(),
          updatedAt: meta?.updatedAt || meta?.publishedAt || new Date().toISOString(),
        }
      })
      //console.log("PP: ", publishedPosts)

    return NextResponse.json({ success: true, posts: publishedPosts })
  } catch (err: any) {
    console.error("Failed to scan R2 post directories:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}