import { NextResponse } from "next/server";
import { ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from "@/lib/blog/r2";
import { createClient } from "@/lib/supabase/server";
import { ManifestPost } from "@/components/blog/blogHelpers";


// Scans R2 and generates/re-prints an accurate manifest.json
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { accountSlug } = await request.json();

    if (!accountSlug) {
      return NextResponse.json({ error: "Missing accountSlug" }, { status: 400 });
    }

    const accountPrefix = `${accountSlug}`;
    const postsPrefix = `${accountPrefix}/posts/`;
    const manifestKey = `${accountPrefix}/manifest.json`;

    // 1. Fetch existing manifest (if present) to preserve stable UUIDs & publishedAt timestamps
    const existingManifestMapBySlug = new Map<string, ManifestPost>();
    try {
      const manifestRes = await r2Client.send(
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: manifestKey })
      );
      if (manifestRes.Body) {
        const rawText = await manifestRes.Body.transformToString();
        const parsedData = JSON.parse(rawText);
        const postsList: ManifestPost[] = parsedData.posts || parsedData || [];
        
        for (const item of postsList) {
          const key = item.postSlug || (item as any).slug;
          if (key) {
            existingManifestMapBySlug.set(key, item);
          }
        }
      }
    } catch {
      // Manifest read is optional (e.g. first initialization)
    }

    // 2. Scan R2 bucket for all published post index.html objects
    const listResult = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: postsPrefix,
      })
    );

    const objects = listResult.Contents || [];

    // Extract unique post slugs from user-content/{accountSlug}/posts/{postSlug}/index.html
    const postSlugs = Array.from(
      new Set(
        objects
          .map((obj) => obj.Key)
          .filter((key): key is string => Boolean(key && key.endsWith("/index.html")))
          .map((key) => {
            const parts = key.split("/");
            return parts[parts.length - 2];
          })
      )
    );

    // 3. Rebuild manifest post list, preserving UUIDs and extracting title metadata
    const posts: ManifestPost[] = await Promise.all(
      postSlugs.map(async (slug) => {
        const htmlKey = `${postsPrefix}${slug}/index.html`;
        const existingEntry = existingManifestMapBySlug.get(slug);

        let title = existingEntry?.title || slug.replace(/-/g, " ");
        let postId = existingEntry?.id || crypto.randomUUID();
        let publishedAt = existingEntry?.publishedAt || new Date().toISOString();
        let updatedAt = new Date().toISOString();

        try {
          const file = await r2Client.send(
            new GetObjectCommand({ Bucket: BUCKET_NAME, Key: htmlKey })
          );
          if (file.Body) {
            const html = await file.Body.transformToString();

            // Extract title tag from HTML document
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            if (titleMatch?.[1]) {
              title = titleMatch[1].trim();
            }

            // Extract data-post-id attribute if present in HTML head/body
            const idMatch = html.match(/data-post-id=["']([^"']+)["']/i);
            if (idMatch?.[1]) {
              postId = idMatch[1];
            }
          }
        } catch {
          // Fallback to defaults if reading HTML fails
        }

        return {
          id: postId,
          postSlug: slug,
          title,
          publishedAt,
          updatedAt,
        };
      })
    );

    const manifest = { posts };

    // 4. Write back updated manifest.json to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: manifestKey,
        Body: JSON.stringify(manifest, null, 2),
        ContentType: "application/json",
      })
    );

    return NextResponse.json({ success: true, manifest: posts });
  } catch (err: any) {
    console.error("Failed to sync manifest:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}