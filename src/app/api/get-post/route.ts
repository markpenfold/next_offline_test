import { NextResponse } from "next/server"
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { r2Client } from "@/lib/blog/r2"
import { createClient } from "@/lib/supabase/server"
import { verifyUserCanPublish } from "@/lib/supabase/queries"

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const bucketName = process.env.R2_USERCONTENT_BUCKET_NAME
  if (!bucketName) {
    return NextResponse.json({ error: "Missing bucket configuration" }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { accountSlug, postId, accountId } = body

    if (!accountSlug || !postId) {
      return NextResponse.json({ error: "Missing accountSlug or postId" }, { status: 400 })
    }

    // 2. Verify authorization (user has publishing rights for this account)
    const canPublish = await verifyUserCanPublish(user.id, accountId );
    if (!canPublish) {
      return NextResponse.json({ error: 'Forbidden: Insufficient publishing privileges' }, { status: 403 });
    }

    const postPrefix = `${accountSlug}/posts/${postId}/`

    // List all objects inside this post's folder prefix on R2
    const listRes = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: postPrefix,
      })
    )

    if (!listRes.Contents || listRes.Contents.length === 0) {
      return NextResponse.json({ error: "Post folder not found on R2" }, { status: 404 })
    }

    const files: Array<{ 
      relativePath: string; 
      content: string; 
      encoding: 'utf-8' | 'base64'; 
      contentType?: string 
    }> = []

    for (const item of listRes.Contents) {
      if (!item.Key) continue
      
      // Strip the prefix to get the relative path (e.g. "index.html" or "media/photo.png")
      const relativePath = item.Key.replace(postPrefix, "")
      if (!relativePath) continue

      const objRes = await r2Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: item.Key })
      )

      if (objRes.Body) {
        const byteArray = await objRes.Body.transformToByteArray()
        const contentType = objRes.ContentType || "application/octet-stream"

        // Handle text files (json, html, markdown) as utf-8 strings, others as base64 binaries
        const isText = relativePath.endsWith('.json') || relativePath.endsWith('.html') || relativePath.endsWith('.txt') || relativePath.endsWith('.md')

        if (isText) {
          const textContent = Buffer.from(byteArray).toString("utf-8")
          files.push({ relativePath, content: textContent, encoding: 'utf-8', contentType })
        } else {
          const base64Content = Buffer.from(byteArray).toString("base64")
          files.push({ relativePath, content: base64Content, encoding: 'base64', contentType })
        }
      }
    }

    return NextResponse.json({ success: true, files })
  } catch (err: any) {
    console.error("Failed to copy post folder from R2:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}