import { NextResponse } from "next/server";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, BUCKET_NAME } from "@/lib/blog/r2";
import { renderFullPage } from "@/lib/blog/template";
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient();

  // 1. Verify token & session via Supabase Auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }


  try {
    const { accountId, accountSlug, postSlug, title, contentHtml } = await request.json()

    if (!accountSlug  ) {
      return NextResponse.json({ error: "Missing accountSlug" }, { status: 400 });
    }
    if (!postSlug ) {
      return NextResponse.json({ error: "Missing postSlug" }, { status: 400 });
    }
    if (!title ) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }
     if (!contentHtml) {
      return NextResponse.json({ error: "Missing contentHtml " }, { status: 400 });
    }
     if (!accountId) {
      return NextResponse.json({ error: "Missing accountId " }, { status: 400 });
    }


    // 1. Fetch existing manifest or start fresh
    const manifestKey = `${accountSlug}/manifest.json`;
    let manifest = { posts: [] as { slug: string; title: string; publishedAt: string }[] };

    try {
      const existingManifest = await r2Client.send(
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: manifestKey })
      );
      if (existingManifest.Body) {
        const str = await existingManifest.Body.transformToString();
        manifest = JSON.parse(str);
      }
    } catch {
      // Manifest does not exist yet for this account; starting with an empty array
    }

    // 2. Update manifest post list (preventing duplicates)
    manifest.posts = manifest.posts.filter((p) => p.slug !== postSlug);
    manifest.posts.unshift({
      slug: postSlug,
      title,
      publishedAt: new Date().toISOString(),
    });

    // 3. Render complete HTML string
    const fullHtml = renderFullPage({
      title,
      contentHtml,
      accountSlug,
      recentPosts: manifest.posts,
    });

    // 4. Upload pre-rendered post HTML to R2
    const htmlKey = `${accountSlug}/posts/${postSlug}/index.html`;
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: htmlKey,
        Body: fullHtml,
        ContentType: "text/html; charset=utf-8",
      })
    );

    // 5. Save updated manifest.json to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: manifestKey,
        Body: JSON.stringify(manifest, null, 2),
        ContentType: "application/json",
      })
    );

    return NextResponse.json({
      success: true,
      url: `https://${accountSlug}.omen.land/${postSlug}`,
    });
  } catch (error: any) {
    console.error("Failed to publish to R2:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}