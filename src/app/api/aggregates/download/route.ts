import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { checkMembershipAndAccess } from "@/lib/supabase/queries";

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

    // 2. Extract request parameters
    const body = await req.json().catch(() => ({}));
    const { accountId, s3Key, key, tier, era, version, cube } = body;

    if (!accountId) {
      return NextResponse.json({ error: "Missing required accountId" }, { status: 400 });
    }

    // 3. Verify account membership & retrieve account's tier
    const accessAllowed = await checkMembershipAndAccess(user.id, accountId);
    if (!accessAllowed) {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this account" },
        { status: 403 }
      );
    }

    const normalizedTier = accessAllowed.toLowerCase();
    const requestedTier = (tier || "free").toLowerCase();

    // 4. Guard against free-tier users requesting pro-tier files
    if (normalizedTier === "free" && requestedTier === "pro") {
      return NextResponse.json(
        { error: "Forbidden: Pro tier index required" },
        { status: 403 }
      );
    }

    // 5. Determine exact R2 object key
    // Prefer direct s3Key / key returned from list endpoint
    let targetKey = s3Key || key;

    if (!targetKey) {
      // Reconstruct default path structure if key wasn't explicitly passed
      const targetCube = cube || "history_cube";
      const targetEra = era?.startsWith("era=") ? era : `era=${era || "post_1900"}`;
      const targetVersion = version || "v1";
      targetKey = `${requestedTier}/${targetCube}/${targetEra}/${targetVersion}/data.parquet`;
    }

    console.log(`📡 [API DEBUG] Streaming R2 Object Key: "${targetKey}" from bucket "${BUCKET_NAME}"`);

    // 6. Request binary stream from R2
    const getObjectCmd = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: targetKey,
    });

    const s3Response = await r2.send(getObjectCmd);

    if (!s3Response.Body) {
      return NextResponse.json(
        { error: "No data payload returned from R2 storage endpoint" },
        { status: 404 }
      );
    }

    // Transform S3 stream to standard Web ReadableStream
    const stream = s3Response.Body.transformToWebStream();

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${targetKey.split("/").pop()}"`,
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });

  } catch (error: any) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      console.error(`❌ [API ERROR] NoSuchKey: Key not found in R2 bucket.`);
      return NextResponse.json(
        { error: "Index file not found in R2 storage" },
        { status: 404 }
      );
    }

    console.error("❌ [API ERROR] R2 Index Stream Failure:", error);
    return NextResponse.json(
      { error: "Failed to download aggregate index shard", details: error.message },
      { status: 500 }
    );
  }
}