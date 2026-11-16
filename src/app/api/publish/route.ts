import { NextResponse } from "next/server";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client} from "@/lib/blog/r2";
import { createClient } from '@/lib/supabase/server'
import { getBucketName } from "@/lib/blog/helpers";
import { rebuildBlogManifest,rebuildRootManifest  } from  "@/lib/blog/manifests"
import { verifyUserCanPublish } from "@/lib/supabase/queries";


export async function POST(request: Request) {
  const supabase = await createClient();

  // 1. Authenticate user
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { postId, accountSlug, postSlug, postMetadata, indexHtml } = await request.json();

    if (!accountSlug || !postId || !indexHtml || !postMetadata) {
      return NextResponse.json({ error: "Missing required publishing payloads" }, { status: 400 });
    }

    // 2. Verify authorization (user has publishing rights for this account)
    const canPublish = await verifyUserCanPublish(user.id, postMetadata.author?.accountId || postMetadata.accountId);
    if (!canPublish) {
      return NextResponse.json({ error: 'Forbidden: Insufficient publishing privileges' }, { status: 403 });
    }

    const bucketName = getBucketName();
    const postFolder = `${accountSlug}/posts/${postId}`;

    // 3. Overwrite/Upload pre-rendered index.html
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: `${postFolder}/index.html`,
        Body: indexHtml,
        ContentType: "text/html; charset=utf-8",
      })
    );

    // 4. Overwrite/Upload updated post.json metadata
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: `${postFolder}/post.json`,
        Body: JSON.stringify(postMetadata, null, 2),
        ContentType: "application/json",
      })
    );

    // Automatically rebuild the account manifest.json 
    // Then rebuild root manifest
    await rebuildBlogManifest(accountSlug)
    await rebuildRootManifest();

    return NextResponse.json({
      success: true,
      id: postId,
      slug: postSlug,
      url: `https://${accountSlug}.omen.land/${postSlug}`,
    });
  } catch (err: any) {
    console.error("Failed to publish to R2:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}