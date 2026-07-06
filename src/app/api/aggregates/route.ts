import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const era = searchParams.get("era");   // 🎯 'pre_1900' | 'post_1900'
  const tier = searchParams.get("tier"); // 🎯 'free' | 'pro'

  // 1. Strict verification parameters
  if (!era || (era !== "pre_1900" && era !== "post_1900")) {
    return NextResponse.json({ error: "Invalid or missing 'era' parameter" }, { status: 400 });
  }
  if (!tier || (tier !== "free" && tier !== "pro")) {
    return NextResponse.json({ error: "Invalid or missing 'tier' parameter" }, { status: 400 });
  }

  // 2. Resolve environment values and match target buckets
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  const bucket = tier === "pro" ? process.env.R2_PRO_BUCKET_NAME : process.env.R2_FREE_BUCKET_NAME;

  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
    console.error("❌ [API ERROR] R2 Environment setup configurations are missing!");
    return NextResponse.json({ 
      error: "R2 Environment credentials missing on host server configuration." 
    }, { status: 500 });
  }

  // 1. Construct the explicit target path key string variable
    const targetKey = `history_cube/era=${era}/data.parquet`; 

    // 2. Add your diagnostic console log statements 🔍
    console.log(`📡 [API DEBUG] Fetching from bucket: "${bucket}"`);
    console.log(`🔑 [API DEBUG] Requesting target R2 object key path: "${targetKey}"`);



  try {
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    // 3. Command routes directly to your partitioned index path layout
    // Adjust this target Key path if your R2 folder layout puts the files somewhere else!
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: targetKey, 
    });

    const s3Response = await r2.send(command);

    if (!s3Response.Body) {
      throw new Error("No data payload returned from R2 storage endpoint.");
    }

    // 4. Stream the binary down to the browser context
    const nodeStream = s3Response.Body as Readable;
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      }
    });

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store", 
      },
    });

  } catch (err: any) {
    console.error("[API ERROR] R2 Index Stream Failure:", err);
    return NextResponse.json({ error: err.message || "Failed downloading R2 object" }, { status: 500 });
  }
}