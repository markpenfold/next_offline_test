import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket");

  if (!bucket) {
    return NextResponse.json({ error: "Missing bucket parameter" }, { status: 400 });
  }

  // Fallback debugging: Check environment keys before constructing the client
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

    // We use a clean ListObjectsV2 setup to scan the top-level virtual paths
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "data/master_category=",
    });

    const response = await r2.send(command);
    const categories = new Set<string>();

    // Handle undefined Contents arrays safely instead of crashing
    if (response.Contents && Array.isArray(response.Contents)) {
      for (const obj of response.Contents) {
        if (!obj.Key) continue;
        const match = obj.Key.match(/data\/master_category=([^/]+)/);
        if (match && match[1]) {
          categories.add(match[1]);
        }
      }
    }

    return NextResponse.json(Array.from(categories).sort());
  } catch (err: any) {
    // This logs the precise underlying SDK crash directly into your terminal output
    console.error("[API ERROR] R2 Listing Failure:", err);
    
    return NextResponse.json({ 
      error: err.message || "Failed listing R2 contents" 
    }, { status: 500 });
  }
}