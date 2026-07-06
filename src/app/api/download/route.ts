import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream"; // 🎯 Added to process Node streams cleanly

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket");
  const file = searchParams.get("file");

  if (!bucket || !file) {
    return NextResponse.json({ error: "Missing bucket or file parameters" }, { status: 400 });
  }

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
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // 🎯 Properly targets 'data/master_category=x/era=y.parquet'
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: `data/${file}`, 
    });

    const s3Response = await r2.send(command);

    if (!s3Response.Body) {
      throw new Error("No data body payload returned from storage endpoint.");
    }

    // 🎯 FIX: Safely convert the Node.js Stream into a Next.js-compatible Web ReadableStream
    const nodeStream = s3Response.Body as Readable;
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => controller.enqueue(chunk));
        nodeStream.on("end", () => controller.close());
        nodeStream.on("error", (err) => controller.error(err));
      }
    });

    const cleanFileName = file.split('/').pop() || 'data.parquet';

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