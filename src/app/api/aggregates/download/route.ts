import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { checkMembershipAndAccess } from "@/lib/supabase/queries";
import { normalizeTier } from "@/lib/utils/general";

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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Authenticate user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Extract parameters (supports explicit s3Key or fallback construction)
    const body = await req.json().catch(() => ({}));
    const { accountId, category, tier = "free", version = "v1", s3Key, key } = body;

    if (!accountId || (!category && !s3Key && !key)) {
      return NextResponse.json(
        { error: "Missing required parameters: accountId and category or s3Key are required" },
        { status: 400 }
      );
    }

    // 3. Verify user's account membership & access tier
    const rawAccessTier = await checkMembershipAndAccess(user.id, accountId);
    if (!rawAccessTier || typeof rawAccessTier !== "string") {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this account" },
        { status: 403 }
      );
    }

    const userTier = normalizeTier(rawAccessTier);
    const requestedTier = normalizeTier(tier);

    // 4. Guard: Prevent free users from requesting pro files
    if (requestedTier === "pro" && userTier !== "pro") {
      return NextResponse.json(
        { error: "Forbidden: Pro tier account required to download this index" },
        { status: 403 }
      );
    }

    // 5. Select target bucket and build Hive key
    const targetBucket = requestedTier === "pro" ? BUCKET_PRO : BUCKET_FREE;
    const cleanVersion = version.replace(/^version=/, "");
    const targetKey = s3Key || key || `master_category=${category}/version=${cleanVersion}/index.parquet`;

    console.log(`Fetching R2 Object: "${targetKey}" from bucket "${targetBucket}"`);

    // 6. Stream binary response from R2
    const s3Response = await r2.send(
      new GetObjectCommand({
        Bucket: targetBucket,
        Key: targetKey,
      })
    );

    if (!s3Response.Body) {
      return NextResponse.json(
        { error: "No data payload returned from R2 storage endpoint" },
        { status: 404 }
      );
    }

    const stream = s3Response.Body.transformToWebStream();
    const fileName = targetKey.split("/").pop() || `${category}_${cleanVersion}.parquet`;

    const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-transform",
    });

    if (s3Response.ContentLength) {
      headers.set("Content-Length", s3Response.ContentLength.toString());
    }

    return new NextResponse(stream, { status: 200, headers });

  } catch (error: any) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return NextResponse.json(
        { error: "Index file not found in R2 storage" },
        { status: 404 }
      );
    }

    console.error("❌ R2 Index Stream Failure:", error);
    return NextResponse.json(
      { error: "Failed to download aggregate index shard", details: error.message },
      { status: 500 }
    );
  }
}