import { NextResponse } from "next/server";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client} from "@/lib/blog/r2";
import { renderFullPage } from "@/lib/blog/template";
import { createClient } from '@/lib/supabase/server'
import { getBucketName } from "@/lib/blog/helpers";
import { ManifestPost, AuthorContext } from "@/components/blog/blogHelpers";
import { fetchExistingManifestMap } from  "@/lib/blog/manifests"

/*
export interface ManifestPost {
  id: string                   // Matches local BlogPost.id
  postSlug: string             // R2 folder slug
  title: string
  publishedAt: string
  updatedAt: string
  subTitle?: string | null
  heroImage?: string | null
  accountSlug: string
  author: AuthorContext
}

export interface AuthorContext {
  userId: string
  accountId: string
  accountSlug?: string
  name: string
}
*/
export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify token & session via Supabase Auth //
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const bucketName = getBucketName();
    // This needs the incoming author context details. 
    const { postId, accountId, accountSlug, postSlug, title, subTitle, heroImage, contentHtml, author } = await request.json()

    if (!accountSlug) return NextResponse.json({ error: "Missing accountSlug" }, { status: 400 });
    if (!postSlug) return NextResponse.json({ error: "Missing postSlug" }, { status: 400 });
    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });
    if (!contentHtml) return NextResponse.json({ error: "Missing contentHtml" }, { status: 400 });
    if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    if (!author) return NextResponse.json({ error: "Missing author" }, { status: 400 });

    // Use passed postId or fallback to postSlug to guarantee persistent ID across OPFS/R2
    const resolvedId = postId || postSlug;

    // Clean title from any trailing site suffixes if present
    const cleanTitle = title.replace(/\s*\|\s*[\w-]+$/, '').trim();

    // 2. Fetch existing manifest or start fresh
    const manifestKey = `${accountSlug}/manifest.json`;

    let manifest = await fetchExistingManifestMap( bucketName, manifestKey)

    // 3. Check if this post already exists in the manifest map
    const existingPost = manifest.get(resolvedId);
    // Determine the published date: keep the original if updating, or use current time if new
    const publishedAt = existingPost ? existingPost.publishedAt : new Date().toISOString();
    const updatedAt = new Date().toISOString();

    // 4. Construct the updated post object
    const postData: ManifestPost = {
      id: resolvedId,
      postSlug,
      title: cleanTitle,
      subTitle: subTitle || null,
      heroImage: heroImage || null,
      accountSlug,
      author: author,
      publishedAt,
      updatedAt
    };

    // 5. Update the Map
    manifest.set(resolvedId, postData);


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
        Body: JSON.stringify({ posts: Array.from(manifest.values()) }, null, 2),        
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