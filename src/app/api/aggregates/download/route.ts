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

    // 4. Determine exact R2 object key FIRST
    let targetKey = s3Key || key;

    if (!targetKey) {
      const targetCube = cube || "history_cube";
      const targetEra = era?.startsWith("era=") ? era : `era=${era || "post_1900"}`;
      const targetVersion = version || "v1";
      const targetTier = (tier || "free").toLowerCase();
      targetKey = `${targetTier}/${targetCube}/${targetEra}/${targetVersion}/data.parquet`;
    }

    // 5. 🔒 GUARD: Extract the REAL target tier from the targetKey prefix
    const actualKeyTier = targetKey.split("/")[0]?.toLowerCase();
    
    if (actualKeyTier === "pro" && normalizedTier !== "pro" && normalizedTier !== "founder") {
      return NextResponse.json(
        { error: "Forbidden: Pro tier account required to download this shard" },
        { status: 403 }
      );
    }

    console.log(`📡 Streaming R2 Object Key: "${targetKey}" from bucket "${BUCKET_NAME}"`);

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

    // Prepare response headers
    const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${targetKey.split("/").pop()}"`,
      "Cache-Control": "private, no-transform",
    });

    // Send Content-Length so the frontend fetch() can show download progress %
    if (s3Response.ContentLength) {
      headers.set("Content-Length", s3Response.ContentLength.toString());
    }

    return new NextResponse(stream, { status: 200, headers });

  } catch (error: any) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      console.error(`❌ NoSuchKey: "${error.message}"`);
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