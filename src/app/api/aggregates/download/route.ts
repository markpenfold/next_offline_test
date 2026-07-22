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

const BUCKET_NAME = process.env.R2_INDEX_BUCKET_NAME || "indexes";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Authenticate user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Extract structured request parameters
    const body = await req.json().catch(() => ({}));
    const { accountId, category, tier = "free", version = "v1" } = body;

    if (!accountId || !category) {
      return NextResponse.json(
        { error: "Missing required parameters: accountId and category are required" }, 
        { status: 400 }
      );
    }

    // 3. Verify user's account membership & normalized entitlement
    const rawAccessTier = await checkMembershipAndAccess(user.id, accountId);
    if (!rawAccessTier || typeof rawAccessTier !== "string") {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this account" },
        { status: 403 }
      );
    }

    const userTier = normalizeTier(rawAccessTier); // Guaranteed "free" | "pro"
    const requestedTier = normalizeTier(tier);     // Guaranteed "free" | "pro"

    // 4. 🔒 GUARD: Prevent free users from requesting pro files
    if (requestedTier === "pro" && userTier !== "pro") {
      return NextResponse.json(
        { error: "Forbidden: Pro tier account required to download this index" },
        { status: 403 }
      );
    }

    // 5. Construct the ONE and ONLY true R2 key
    const targetKey = `${requestedTier}/category=${category}/version=${version}/index.parquet`;

    console.log(`📡 Fetching R2 Object: "${targetKey}" from bucket "${BUCKET_NAME}"`);

    // 6. Stream binary response from R2
    const s3Response = await r2.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
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

    const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${category}_${version}.parquet"`,
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