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

    // 4. Fetch category folders (e.g. "free/master_category=aircraft/")
    const categoryResponses = await Promise.all(
      prefixesToScan.map((prefix) =>
        r2.send(
          new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix,
            Delimiter: "/",
          })
        )
      )
    );

    const categoryPrefixes = categoryResponses.flatMap(
      (res) => (res.CommonPrefixes || []).map((p) => p.Prefix!).filter(Boolean)
    );

    // 5. Fetch all version subfolders per category concurrently
    const versionResponses = await Promise.all(
      categoryPrefixes.map((catPrefix) =>
        r2.send(
          new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: catPrefix,
            Delimiter: "/",
          })
        )
      )
    );

    // 6. Group categories and extract their version arrays
    const availableIndexes = versionResponses.map((res, idx) => {
      const catPrefix = categoryPrefixes[idx];
      const parts = catPrefix.split("/").filter(Boolean);

      const tier = normalizeTier(parts[0]);
      const categoryPart = parts.find((p) => p.startsWith("master_category=")) || parts[1] || "";
      const category = categoryPart.replace(/^master_category=/, "");

      // Extract version subfolder strings (e.g. "version=v2" -> "v2")
      const versionFolders = res.CommonPrefixes || [];
      const versions = versionFolders
        .map((vf) => {
          const vParts = (vf.Prefix || "").split("/").filter(Boolean);
          const rawVersion = vParts.find((p) => p.startsWith("version=") || p.startsWith("v")) || "";
          return rawVersion.replace(/^version=/, "");
        })
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })); // e.g. ["v3", "v2", "v1"]

      const key = catPrefix;
      return {
        key,
        category,
        tier,
        versions, // Available versions for dropdown
        defaultVersion: versions[0] || "v1", // Newest version selected by default
      };
    });

    return NextResponse.json({
      activeTier: normalizedTier, // the user's access level
      bucketUsed: BUCKET_NAME,  // indexes
      indexes: availableIndexes,  // array of AvailableIndex items
    });

  } catch (error: any) {
    console.error("❌ [API ERROR] Error listing R2 indexes:", error);
    return NextResponse.json(
      { error: "Failed to compile remote scanning manifests", details: error.message },
      { status: 500 }
    );
  }
}
/* RETURN FORMAT //////////
{
  "activeTier": "pro",
  "bucketUsed": "indexes",
  "indexes": [
    {
      "category": "aircraft",
      "tier": "free",
      "versions": ["v3", "v2", "v1"],
      "defaultVersion": "v3"
    },
    {
      "category": "architecture_churches",
      "tier": "free",
      "versions": ["v1"],
      "defaultVersion": "v1"
    }
  ]
}
*/