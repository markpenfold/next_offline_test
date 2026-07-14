import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

    // 3. Extract active account ID from request body
    const body = await req.json().catch(() => ({}));
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json({ error: "Missing required accountId" }, { status: 400 });
    }

    // 4. Verify membership & retrieve user's account tier (free / pro / founder)
    const accessAllowed = await checkMembershipAndAccess(user.id, accountId);

    if (!accessAllowed) {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this account" },
        { status: 403 }
      );
    }
    const normalizedTier = accessAllowed.toLowerCase();

    // 5. Determine prefixes based on entitlement tier
    // Pro and Founder users see both 'free/' and 'pro/' prefixes; Free users only see 'free/'
    const isElevatedTier = normalizedTier === "pro" || normalizedTier === "founder";
    const prefixesToScan = isElevatedTier ? ["free/", "pro/"] : ["free/"];

    // 6. Scan R2 prefixes concurrently
    const listResponses = await Promise.all(
      prefixesToScan.map((prefix) =>
        r2.send(
          new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix,
          })
        )
      )
    );

    // Flatten all returned R2 objects
    const allObjects = listResponses.flatMap((res) => res.Contents || []);

    // Filter out directory markers or empty keys
    const validObjects = allObjects.filter((obj) => obj.Key && !obj.Key.endsWith("/"));

    // 7. Parse metadata synchronously (Fast: No async signing loops needed!)
    const availableIndexes = validObjects.map((object) => {
      const key = object.Key!;
      const parts = key.split("/");
      //console.log("FILE NAME: ", parts[parts.length - 1]);

      // Structure: ['free' | 'pro', 'category=african', 'era=post_1900', 'version=v1', 'index.parquet']
      const tier = parts[0] || normalizedTier;
      const rawCategory = parts[1] || "category=history_cube";
      const cube = rawCategory.replace(/^category=/, "");
      const rawEra = parts[2] || "era=post_1900";
      const era = rawEra.replace("era=", "");
      const version = parts[parts.length - 2] || "v1";
      const fileName = parts[parts.length - 1];

      return {
        key, // Crucial: The download proxy expects this string as `key` or `s3Key`
        fileName,
        cube,
        era,
        tier,
        version,
        size: object.Size,
        lastModified: object.LastModified,
      };
    });

    return NextResponse.json({
      activeTier: normalizedTier,
      bucketUsed: BUCKET_NAME,
      indexes: availableIndexes,
    });

  } catch (error: any) {
    console.error("❌ [API ERROR] Error listing R2 indexes:", error);
    return NextResponse.json(
      { error: "Failed to compile remote scanning manifests", details: error.message },
      { status: 500 }
    );
  }
}