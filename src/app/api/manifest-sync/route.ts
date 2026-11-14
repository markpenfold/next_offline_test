import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client } from "@/lib/blog/r2";
import { createClient } from "@/lib/supabase/server";
import { rebuildAccountManifestFromR2 } from "@/lib/blog/manifests"; // Adjust path as needed

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

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bucketName = process.env.R2_USERCONTENT_BUCKET_NAME;
  if (!bucketName) {
    console.error('R2 Error: R2_USERCONTENT_BUCKET_NAME environment variable is not defined.');
    return NextResponse.json(
      { error: 'Server configuration error: Missing R2_USERCONTENT_BUCKET_NAME.' },
      { status: 500 }
    );
  }

  try {
    const { accountSlug, accountId } = await request.json();

    if (!accountSlug) {
      return NextResponse.json({ error: "Missing accountSlug" }, { status: 400 });
    }

    // 1. Rebuild the manifest by scanning R2 via the external function
    const scannedPosts = await rebuildAccountManifestFromR2({
      bucketName,
      accountSlug,
      accountId,
      user,
    });

    const manifestKey = `${accountSlug}/manifest.json`;

    // 2. Write back the updated account manifest to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: manifestKey,
        Body: JSON.stringify({ posts: scannedPosts }, null, 2),
        ContentType: "application/json",
      })
    );

    return NextResponse.json({ success: true, manifest: scannedPosts });
  } catch (err: any) {
    console.error("Failed to sync account manifest:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}