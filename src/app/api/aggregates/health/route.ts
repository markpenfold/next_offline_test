import { NextRequest, NextResponse } from "next/server";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_INDEX_BUCKET_NAME || "indexes";

export async function GET(req: NextRequest) {
  try {
    const targetKey = "free/r2health.txt";
    // HeadObjectCommand checks if the file exists without downloading the content
    await r2.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: targetKey,
      })
    );

    return NextResponse.json(
      { status: "healthy", r2: "connected" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ R2 Healthcheck Failed:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error.name === "NotFound" || error.name === "NoSuchKey" 
          ? "Healthcheck file missing" 
          : "R2 connection failure",
      },
      { status: 503 }
    );
  }
}