import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { checkMembershipAndAccess } from "@/lib/supabase/queries";
import { normalizeTier } from "@/lib/utils/general";

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

    // 4. Verify membership & retrieve raw tier
    const rawAccessTier = await checkMembershipAndAccess(user.id, accountId);

    if (!rawAccessTier || typeof rawAccessTier !== "string") {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this account" },
        { status: 403 }
      );
    }

    // Lock down user tier to strictly "free" or "pro"
    const normalizedTier = normalizeTier(rawAccessTier);

    // 5. Determine R2 prefixes to scan
    const prefixesToScan = ["free/"];
    if (normalizedTier === "pro") {
      prefixesToScan.push("pro/");
    }

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

    // 7. Parse metadata synchronously into AvailableIndex schema
    const availableIndexes = validObjects.map((object) => {
      const rawKey = object.Key!;
      const parts = rawKey.split("/");

      // Structure: ['free' | 'pro', 'category=<cat>', 'version=<v>', 'index.parquet']
      const tierStr = parts[0];
      const tier = normalizeTier(tierStr);

      // Extract category (e.g. "category=music_albums" -> "music_albums")
      const categoryPart = parts.find((p) => p.startsWith("category=")) || parts[1] || "";
      const category = categoryPart.replace(/^category=/, "");

      // Extract version (e.g. "version=v1" -> "v1")
      const versionPart = parts.find((p) => p.startsWith("version=")) || parts[parts.length - 2] || "v1";
      const version = versionPart.replace(/^version=/, "");

      // Unique OPFS-friendly identifier
      const fileName = `index__${tier}__${category}__version__${version}.parquet`;

      return {
        fileName,
        category,             // Clean category string (e.g. "music_albums")
        tier,                 // Guaranteed "free" | "pro"
        version,              // Clean version string (e.g. "v1")
        sizeBytes: object.Size,
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