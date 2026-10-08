import { NextResponse } from "next/server";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/blog/r2";
import { renderFullPage } from "@/lib/blog/template";
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient();

  // 1. Verify token & session via Supabase Auth
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const bucketName = process.env.R2_USERCONTENT_BUCKET_NAME
    if (!bucketName) {
    console.error('R2 Error: R2_USERCONTENT_BUCKET_NAME environment variable is not defined.')
    return NextResponse.json(
      { error: 'Server configuration error: Missing R2_USERCONTENT_BUCKET_NAME.' },
      { status: 500 }
    )
  }

  try {
    const { postId, accountId, accountSlug, postSlug, title, subTitle, heroImage, contentHtml } = await request.json()

    if (!accountSlug) return NextResponse.json({ error: "Missing accountSlug" }, { status: 400 });
    if (!postSlug) return NextResponse.json({ error: "Missing postSlug" }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });
    if (!contentHtml) return NextResponse.json({ error: "Missing contentHtml" }, { status: 400 });
    if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

    // Use passed postId or fallback to postSlug to guarantee persistent ID across OPFS/R2
    const resolvedId = postId || postSlug;

    // Clean title from any trailing site suffixes if present
    const cleanTitle = title.replace(/\s*\|\s*[\w-]+$/, '').trim();

    // 2. Fetch existing manifest or start fresh
    const manifestKey = `${accountSlug}/manifest.json`;
    let manifest = { posts: [] as { id: string; slug: string; title: string; subTitle?: string | null; heroImage?: string | null; publishedAt: string; updatedAt: string }[] };

    try {
      const existingManifest = await r2Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: manifestKey })
      );
      if (existingManifest.Body) {
        const str = await existingManifest.Body.transformToString();
        manifest = JSON.parse(str);
      }
    } catch {
      // Manifest does not exist yet for this account; starting with an empty array
    }

    const now = new Date().toISOString();
    
    // 3. Update manifest post list by matching resolved ID or Slug (prevent duplicates)
    manifest.posts = manifest.posts.filter((p) => p.id !== resolvedId && p.slug !== postSlug);
    manifest.posts.unshift({
      id: resolvedId,
      slug: postSlug,
      title: cleanTitle,
      subTitle: subTitle || null,
      heroImage: heroImage || null,
      publishedAt: now,
      updatedAt: now,
    });

    // 4. Render complete HTML string using clean raw title, subTitle, and heroImage
    const fullHtml = renderFullPage({
      title: cleanTitle,
      subTitle: subTitle || null,
      heroImage: heroImage || null,
      contentHtml,
      accountSlug,
    });

    // 5. Upload pre-rendered post HTML to R2
    const htmlKey = `${accountSlug}/posts/${postSlug}/index.html`;
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: htmlKey,
        Body: fullHtml,
        ContentType: "text/html; charset=utf-8",
      })
    );

    // 6. Save updated manifest.json to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: manifestKey,
        Body: JSON.stringify(manifest, null, 2),
        ContentType: "application/json",
      })
    );

    return NextResponse.json({
      success: true,
      id: resolvedId,
      slug: postSlug,
      title: cleanTitle,
      subTitle: subTitle || null,
      heroImage: heroImage || null,
      url: `https://${accountSlug}.omen.land/${postSlug}`,
    });
  } catch (error: any) {
    console.error("Failed to publish to R2:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}