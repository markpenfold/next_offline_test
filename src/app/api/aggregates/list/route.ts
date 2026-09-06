import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { checkMembershipAndAccess } from "@/lib/supabase/queries";
import { normalizeTier } from "@/lib/utils/general";

export interface AvailableIndex {
  key: string;
  fileName: string;
  category: string;
  tier: "free" | "pro";
  version: string;
  cube?: string;
  s3Key?: string;
  sizeBytes?: number;
  handle?: FileSystemFileHandle;
}

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

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate request body
    const body = await req.json().catch(() => ({}));
    const { accountId } = body;
    if (!accountId) {
      return NextResponse.json({ error: "Missing required accountId" }, { status: 400 });
    }

    // 3. Verify membership & access tier
    const rawAccessTier = await checkMembershipAndAccess(user.id, accountId);
    if (!rawAccessTier || typeof rawAccessTier !== "string") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const normalizedTier = normalizeTier(rawAccessTier);
    const prefixesToScan = ["free/"];
    if (normalizedTier === "pro") prefixesToScan.push("pro/");

    // 4. Fetch objects recursively under accessible tier folders
    const objectResponses = await Promise.all(
      prefixesToScan.map((prefix) =>
        r2.send(
          new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix,
          })
        )
      )
    );

    console.log("RESPONSES: ", objectResponses)
    // 5. Group objects by version directory level to collapse chunked files
    const indexMap = new Map<string, AvailableIndex>();

    for (const res of objectResponses) {
      for (const obj of res.Contents || []) {
        if (!obj.Key || obj.Key.endsWith("/")) continue;

        const parts = obj.Key.split("/").filter(Boolean);

        // Find the folder segment containing the version
        const versionIndex = parts.findIndex(
          (p) => p.startsWith("version=") || p.match(/^v\d+$/i)
        );

        if (versionIndex === -1) continue; // Skip files outside a version scope

        // Truncate path up to the version directory level
        const versionFolderPath = parts.slice(0, versionIndex + 1).join("/") + "/";

        const tier = (normalizeTier(parts[0]) === "pro" ? "pro" : "free") as "free" | "pro";

        const categoryPart = parts.find((p) => p.startsWith("master_category=")) || parts[1] || "";
        const category = categoryPart.replace(/^master_category=/, "");

        const versionRaw = parts[versionIndex];
        const version = versionRaw.replace(/^version=/, "");

        // Dedup key based on version folder path
        const mapKey = versionFolderPath;

        if (!indexMap.has(mapKey)) {
          indexMap.set(mapKey, {
            key: mapKey,
            fileName: `${category}_${version}.parquet`,
            category,
            tier,
            version,
            s3Key: versionFolderPath,
            sizeBytes: obj.Size || 0,
          });
        } else {
          // Sum up bytes across all parquet chunks in this version directory
          const existing = indexMap.get(mapKey)!;
          existing.sizeBytes = (existing.sizeBytes || 0) + (obj.Size || 0);
        }
      }
    }

    const indexes = Array.from(indexMap.values());

    return NextResponse.json({
      activeTier: normalizedTier,
      bucketUsed: BUCKET_NAME,
      indexes,
    });

  } catch (error: any) {
    console.error("❌ [API ERROR] Error listing R2 indexes:", error);
    return NextResponse.json(
      { error: "Failed to compile remote scanning manifests", details: error.message },
      { status: 500 }
    );
  }
}