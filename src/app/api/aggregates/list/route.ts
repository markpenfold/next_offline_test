import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { checkMembershipAndAccess } from "@/lib/supabase/queries";
import { normalizeTier } from "@/lib/utils/general";

/*
This route is called by fetchAvailableIndexes(accountId: string)
Found in CloudR2.ts
This, in turn is called by async function getAllIndexes(accountId: string) 
Found in OmenlandInit.ts
*/
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

const BUCKET_FREE = process.env.R2_INDEX_FREE_BUCKET || "index-free";
const BUCKET_PRO = process.env.R2_INDEX_PRO_BUCKET || "index-pro";

// Helper: Parse key path into standard AvailableIndex object
function parseKeyToAvailableIndex(
  key: string,
  tier: "free" | "pro",
  sizeBytes: number
): AvailableIndex | null {
  if (key.endsWith("/") || key === "manifest.json") return null;

  const parts = key.split("/").filter(Boolean);
  const catPart = parts.find((p) => p.startsWith("master_category="));
  const verPart = parts.find((p) => p.startsWith("version=") || p.match(/^v\d+$/i));

  if (!catPart || !verPart) return null;

  const category = catPart.replace(/^master_category=/, "");
  const version = verPart.replace(/^version=/, "");

  return {
    key,
    fileName: `${category}_${version}.parquet`,
    category,
    tier,
    version,
    s3Key: key,
    sizeBytes,
  };
}

// Helper: Attempt to load and parse a pre-computed manifest.json from a bucket
async function tryFetchManifest(
  bucket: string,
  tier: "free" | "pro"
): Promise<AvailableIndex[] | null> {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: "manifest.json" });
    const response = await r2.send(command);
    const bodyText = await response.Body?.transformToString();
    if (!bodyText) return null;

    const parsed = JSON.parse(bodyText);

    // Handle manifest object payload ({ bucket, files: [{ key, size_bytes }] })
    if (parsed && Array.isArray(parsed.files)) {
      const items: AvailableIndex[] = [];
      for (const file of parsed.files) {
        const indexObj = parseKeyToAvailableIndex(file.key, tier, file.size_bytes || 0);
        if (indexObj) items.push(indexObj);
      }
      return items;
    }

    // Direct Array Fallback
    if (Array.isArray(parsed)) {
      return parsed as AvailableIndex[];
    }

    return null;
  } catch {
    return null; // Silent catch -> triggers dynamic scanning fallback
  }
}

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

    // Build bucket query targets based on access level
    const bucketsToFetch: Array<{ bucket: string; tier: "free" | "pro" }> = [
      { bucket: BUCKET_FREE, tier: "free" },
    ];

    if (normalizedTier === "pro") {
      bucketsToFetch.push({ bucket: BUCKET_PRO, tier: "pro" });
    }

    // =========================================================================
    // PRIMARY ATTACK: Try loading pre-compiled manifest files (~30ms)
    // =========================================================================
    const manifestResults = await Promise.all(
      bucketsToFetch.map(({ bucket, tier }) => tryFetchManifest(bucket, tier))
    );

    const hasAllManifests = manifestResults.every((res) => res !== null);

    if (hasAllManifests) {
      const combinedIndexes = manifestResults.flat() as AvailableIndex[];
      return NextResponse.json({
        activeTier: normalizedTier,
        bucketsUsed: bucketsToFetch.map((b) => b.bucket),
        source: "manifest",
        indexes: combinedIndexes,
      });
    }

    // =========================================================================
    // FALLBACK ATTACK: Recursive ListObjectsV2 bucket scanning (~5s)
    // =========================================================================
    console.warn("⚠️ [R2 Manifest Miss] Falling back to recursive bucket scanning...");

    const objectResponses = await Promise.all(
      bucketsToFetch.map(({ bucket, tier }) =>
        r2
          .send(new ListObjectsV2Command({ Bucket: bucket }))
          .then((res) => ({ res, bucket, tier }))
      )
    );

    const indexMap = new Map<string, AvailableIndex>();

    for (const { res, tier } of objectResponses) {
      for (const obj of res.Contents || []) {
        if (!obj.Key) continue;

        const indexObj = parseKeyToAvailableIndex(obj.Key, tier, obj.Size || 0);
        if (!indexObj) continue;

        if (!indexMap.has(indexObj.key)) {
          indexMap.set(indexObj.key, indexObj);
        } else {
          const existing = indexMap.get(indexObj.key)!;
          existing.sizeBytes = (existing.sizeBytes || 0) + (obj.Size || 0);
        }
      }
    }

    return NextResponse.json({
      activeTier: normalizedTier,
      bucketsUsed: bucketsToFetch.map((b) => b.bucket),
      source: "live_scan",
      indexes: Array.from(indexMap.values()),
    });

  } catch (error: any) {
    console.error("❌ [API ERROR] Error listing R2 indexes:", error);
    return NextResponse.json(
      { error: "Failed to compile remote scanning manifests", details: error.message },
      { status: 500 }
    );
  }
}