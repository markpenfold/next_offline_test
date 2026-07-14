import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { checkMembershipAndAccess } from "@/lib/supabase/queries";

// 1. Initialize R2 Client
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_INDEX_BUCKET_NAME || "indexes";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 2. Authenticate user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3. Extract active account ID from body
    const body = await req.json().catch(() => ({}));
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json({ error: "Missing required accountId" }, { status: 400 });
    }

    // 4. Verify membership & retrieve user's tier
    const accessAllowed = await checkMembershipAndAccess(user.id, accountId);

    if (!accessAllowed) {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this account" },
        { status: 403 }
      );
    }

    const normalizedTier = accessAllowed.toLowerCase();

    // 5. Query the 'indexes' bucket under prefix 'free/' or 'pro/'
    const prefix = `${normalizedTier}/`;

    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
    });
  
    const r2Response = await r2.send(listCommand);
    const availableIndexes = [];

    if (r2Response.Contents) {
        for (const object of r2Response.Contents) {
            if (!object.Key || object.Key.endsWith("/")) continue;

            // Split: ['free', 'history_cube', 'era=post_1900', 'v1', 'filename.parquet']
            const parts = object.Key.split("/");
            
            const tier     = parts[0] || normalizedTier;
            const cube     = parts[1] || "history_cube";
            const rawEra   = parts[2] || "era=post_1900";
            const era      = rawEra.replace("era=", "");
            const version  = parts[parts.length - 2] || "v1"; // Immediate parent folder
            const fileName = parts[parts.length - 1];         // File name

            const getObjectCmd = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: object.Key,
            });
            const downloadUrl = await getSignedUrl(r2, getObjectCmd, { expiresIn: 3600 });

            availableIndexes.push({
            key: object.Key,
            fileName,
            cube,
            era,
            tier,
            version, // Clean "v1" string
            size: object.Size,
            lastModified: object.LastModified,
            downloadUrl,
            });
        }
        }

    return NextResponse.json({
      activeTier: normalizedTier,
      bucketUsed: BUCKET_NAME,
      indexes: availableIndexes,
    });

  } catch (error: any) {
    console.error("Error listing R2 indexes:", error);
    return NextResponse.json(
      { error: "Failed to compile remote scanning manifests" },
      { status: 500 }
    );
  }
}