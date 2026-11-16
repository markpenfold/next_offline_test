import { NextResponse } from "next/server";
import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/blog/r2";
import { createClient } from '@/lib/supabase/server';
import { getBucketName } from "@/lib/blog/helpers";
import { verifyUserCanPublish } from "@/lib/supabase/queries";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { accountSlug, postId, accountId } = await request.json();
    
    if (!accountSlug || !postId || !accountId) {
      return NextResponse.json({ error: "Missing accountSlug or postId" }, { status: 400 });
    }

    // CAN THIS USER ALTER THE CURRENT BLOG ? 
    const canPublish = await verifyUserCanPublish(user.id, accountId);
    if (!canPublish) {
        return NextResponse.json({ error: 'Forbidden: You do not have publishing rights for this account' }, { status: 403 });
    }

    const bucketName = getBucketName();
    const mediaPrefix = `${accountSlug}/posts/${postId}/media/`;

    // 1. List existing files in the post's R2 media folder
    const listed = await r2Client.send(
      new ListObjectsV2Command({ Bucket: bucketName, Prefix: mediaPrefix })
    );

    if (listed.Contents && listed.Contents.length > 0) {
      const objectsToDelete = listed.Contents.map((item) => ({ Key: item.Key! }));
      
      // 2. Batch delete old assets
      await r2Client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: objectsToDelete },
        })
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to clear media folder:", err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });  }
}