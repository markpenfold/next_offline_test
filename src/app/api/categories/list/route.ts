import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { checkMembershipAndAccess } from "@/lib/supabase/queries";

// Initialize R2 Client
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Extract accountId from body
    const body = await req.json().catch(() => ({}));
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json({ error: "Missing required accountId" }, { status: 400 });
    }

    // 3. Check access level
    const accessAllowed = await checkMembershipAndAccess(user.id, accountId);

    if (!accessAllowed) {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this account" },
        { status: 403 }
      );
    }

    const normalizedTier = accessAllowed.toLowerCase();

    // 4. Define target buckets based on membership tier
    const proBucket = process.env.R2_PRO_BUCKET_NAME || "history-files";
    const freeBucket = process.env.R2_FREE_BUCKET_NAME || "history-files-free";

    const bucketsToList: { bucketName: string; tierLabel: string }[] = [];

    // Free users get free bucket only
    bucketsToList.push({ bucketName: freeBucket, tierLabel: "free" });

    // Pro users get both pro and free buckets
    if (normalizedTier === "pro") {
      bucketsToList.push({ bucketName: proBucket, tierLabel: "pro" });
    }

    const prefix = "data/";
    const availableDataShards: any[] = [];

    // Helper function to scan a bucket and build shard metadata
    const scanBucket = async (bucketName: string, tierLabel: string) => {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
      });

      const r2Response = await r2.send(listCommand);

      if (r2Response.Contents) {
        for (const object of r2Response.Contents) {
          if (!object.Key || object.Key.endsWith("/")) continue;

          // Path: data / {masterCategory} / {era} / {version} / {fileName}
          const parts = object.Key.split("/");

          const masterCategory = parts[1] || "default_category";
          const rawEra         = parts[2] || "era=post_1900";
          const era            = rawEra.replace("era=", "");
          const version        = parts[parts.length - 2] || "v1";
          const fileName       = parts[parts.length - 1];

          // Generate presigned URL for secure download
          const getObjectCmd = new GetObjectCommand({
            Bucket: bucketName,
            Key: object.Key,
          });
          const downloadUrl = await getSignedUrl(r2, getObjectCmd, { expiresIn: 3600 });

          availableDataShards.push({
            key: object.Key,
            fileName,
            masterCategory,
            era,
            tier: tierLabel, // Identifies if file came from free or pro bucket
            version,
            sizeBytes: object.Size,
            lastModified: object.LastModified,
            downloadUrl,
          });
        }
      }
    };

    // 5. Run listings in parallel for max performance
    await Promise.all(
      bucketsToList.map((target) => scanBucket(target.bucketName, target.tierLabel))
    );

    return NextResponse.json({
      activeTier: normalizedTier,
      bucketsScanned: bucketsToList.map((b) => b.bucketName),
      dataShards: availableDataShards,
    });

  } catch (error: any) {
    console.error("Error listing R2 data shards:", error);
    return NextResponse.json(
      { error: "Failed to compile remote scanning manifests for data shards" },
      { status: 500 }
    );
  }
}