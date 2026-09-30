import { NextResponse } from "next/server";
import { ListObjectsV2Command, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from "@/lib/blog/r2";
import { createClient } from "@/lib/supabase/server";

// Scans R2 and generates a new manifst.json
// So we know after this runs the manifest is accurate
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

    const prefix = `${accountSlug}/posts/`;

    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    });

    const listResult = await r2Client.send(listCommand);
    const objects = listResult.Contents || [];

    // Extract unique post slugs from {accountSlug}/posts/{postSlug}/index.html
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

    // Build post list and extract title from HTML if possible
    const posts = await Promise.all(
      postSlugs.map(async (slug) => {
        const htmlKey = `${accountSlug}/posts/${slug}/index.html`;
        let title = slug.replace(/-/g, " ");

        try {
          const file = await r2Client.send(
            new GetObjectCommand({ Bucket: BUCKET_NAME, Key: htmlKey })
          );
          if (file.Body) {
            const html = await file.Body.transformToString();
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            if (titleMatch?.[1]) {
              title = titleMatch[1];
            }
          }
        } catch {
          // Fall back to slug title if file read fails
        }

        return {
          slug,
          title,
          publishedAt: new Date().toISOString(),
        };
      })
    );

    const manifest = { posts };
    const manifestKey = `${accountSlug}/manifest.json`;

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