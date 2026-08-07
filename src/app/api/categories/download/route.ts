import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { createClient } from "@/lib/supabase/server";
import { checkMembershipAndAccess } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Extract request body params
    const body = await req.json().catch(() => ({}));
    const { accountId, file, key, tier } = body;

    if (!accountId) {
      return NextResponse.json({ error: "Missing required accountId" }, { status: 400 });
    }

    // Key or File parameter is required
    const targetKey = key || (file ? `data/${file}` : null);
    if (!targetKey) {
      return NextResponse.json({ error: "Missing file or key parameter" }, { status: 400 });
    }

    // 3. Verify membership & access level
    const accessAllowed = await checkMembershipAndAccess(user.id, accountId);
    if (!accessAllowed) {
      return NextResponse.json(
        { error: "Forbidden: You are not a member of this account" },
        { status: 403 }
      );
    }

    // Safe extraction & normalization of user tier string
    const userTier = (
      typeof accessAllowed === "object" && accessAllowed !== null
        ? accessAllowed.tier || accessAllowed.role || "free"
        : String(accessAllowed)
    ).toLowerCase();

    // Pro and Founder tiers have paid access
    const hasPaidAccess = userTier === "pro" || userTier === "founder";

    // Block free-tier accounts from requesting pro shards
    if (tier === "pro" && !hasPaidAccess) {
      return NextResponse.json(
        { error: "Forbidden: Pro or Founder access required for this dataset" },
        { status: 403 }
      );
    }

    // 4. Resolve Bucket
    const targetBucket = tier === "pro"
      ? (process.env.R2_PRO_BUCKET_NAME || "history-files")
      : (process.env.R2_FREE_BUCKET_NAME || "history-files-free");

    // 5. Initialize S3 / R2 Client
    const r2 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });

    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: targetKey,
    });

    const s3Response = await r2.send(command);

    if (!s3Response.Body) {
      throw new Error("No data body payload returned from storage endpoint.");
    }

    // 6. Convert Node Stream to Web ReadableStream
    const nodeStream = s3Response.Body as Readable;
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      }
    });

    const cleanFileName = targetKey.split('/').pop() || 'data.parquet';

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${cleanFileName}"`,
        "Cache-Control": "no-store",
      },
    });

  } catch (err: any) {
    console.error("[API ERROR] R2 Object Stream Failure:", err);
    return NextResponse.json({
      error: err.message || "Failed downloading R2 object"
    }, { status: 500 });
  }
}