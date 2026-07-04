import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket");
  const file = searchParams.get("file");

  // Validate incoming parameters
  if (!bucket || !file) {
    return NextResponse.json({ error: "Missing bucket or file parameters" }, { status: 400 });
  }

  // Ensure environment keys exist before constructing the client
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.error("❌ [API ERROR] R2 Environment variables are missing or undefined!");
    return NextResponse.json({ 
      error: "R2 Environment credentials missing on host server configuration." 
    }, { status: 500 });
  }

  try {
    // 1. Initialize the S3 Client matching your structure exactly
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // 2. Build the command targeting your unique parquet resource path
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: file, // e.g. "master_category=hitler/era=post_1900.parquet"
    });

    // 3. Request the object from Cloudflare R2
    const s3Response = await r2.send(command);

    if (!s3Response.Body) {
      throw new Error("No data body payload returned from storage endpoint.");
    }

    // 4. Transform the S3 response body into a clean stream Next.js can pass along
    const stream = s3Response.Body as ReadableStream;

    // Extract the raw file name out of the path for the header metadata
    const cleanFileName = file.split('/').pop() || 'data.parquet';

    // 5. Send back the response with correct binary attachment headers
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${cleanFileName}"`,
        "Cache-Control": "no-store", // Prevents Next.js from aggressively caching the API file output
      },
    });

  } catch (err: any) {
    console.error("[API ERROR] R2 Object Stream Failure:", err);
    return NextResponse.json({ 
      error: err.message || "Failed downloading R2 object" 
    }, { status: 500 });
  }
}