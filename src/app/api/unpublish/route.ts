import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/blog/r2";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const { accountSlug, postSlug } = await request.json();

    if (!accountSlug || !postSlug) {
      return NextResponse.json({ error: "Missing accountSlug or postSlug" }, { status: 400 });
    }
    console.log("GONNA TRY AND KILL: ",accountSlug, postSlug)

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
      const existingManifest = await r2Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: manifestKey })
      );
      if (existingManifest.Body) {
        const str = await existingManifest.Body.transformToString();
        const manifest = JSON.parse(str);

        manifest.posts = (manifest.posts || []).filter((p: any) => p.slug !== postSlug);

        await r2Client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: manifestKey,
            Body: JSON.stringify(manifest, null, 2),
            ContentType: "application/json",
          })
        );
      }
    } catch {
      // Manifest read ignored if missing
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to unpublish post:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}