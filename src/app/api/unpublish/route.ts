import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/blog/r2";
import { createClient } from "@/lib/supabase/server";
import { getBucketName } from "@/lib/blog/helpers";
import { fetchExistingManifestMap } from "@/lib/blog/manifests";


export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bucketName = getBucketName();
    const { accountSlug, postSlug, postId } = await request.json();

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

    // 2. Remove post from R2 manifest.json
    const manifestKey = `${accountSlug}/manifest.json`;
    try {
      let manifest = await fetchExistingManifestMap( bucketName, manifestKey)
      manifest.delete(postId);

        await r2Client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: manifestKey,
            Body: JSON.stringify({ posts: Array.from(manifest.values()) }, null, 2),
            ContentType: "application/json",
          })
        );
      }
     catch {
      // Manifest read ignored if missing
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to unpublish post:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
