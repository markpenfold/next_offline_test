import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/blog/r2";
import { createClient } from "@/lib/supabase/server";
import { getBucketName } from "@/lib/blog/helpers";
import { rebuildRootManifest, rebuildBlogManifest } from  "@/lib/blog/manifests"
import { verifyUserCanPublish } from "@/lib/supabase/queries";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bucketName = getBucketName();
    const { accountSlug, postSlug, postId, accountId } = await request.json();
    
    // 2. Verify authorization (user has publishing rights for this account)
    const canPublish = await verifyUserCanPublish(user.id, accountId);
    if (!canPublish) {
      return NextResponse.json({ error: 'Forbidden: Insufficient publishing privileges' }, { status: 403 });
    }

    

    if (!accountSlug || !postSlug) {
      return NextResponse.json({ error: "Missing accountSlug or postSlug" }, { status: 400 });
    }

    // 1. Delete all R2 storage objects under the post directory
    const postPrefix = `${accountSlug}/posts/${postSlug}/`;
    const listResult = await r2Client.send(
      new ListObjectsV2Command({ Bucket: bucketName, Prefix: postPrefix })
    );

    if (listResult.Contents && listResult.Contents.length > 0) {
      await r2Client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: listResult.Contents.map((obj) => ({ Key: obj.Key })),
          },
        })
      );
    }
 
    // Automatically rebuild the account manifest.json 
    // Then rebuild root manifest
    await rebuildBlogManifest(accountSlug)
    await rebuildRootManifest();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to unpublish post:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
