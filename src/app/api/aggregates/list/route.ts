import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function GET() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  const proBucket = process.env.R2_PRO_BUCKET_NAME;
  const freeBucket = process.env.R2_FREE_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return NextResponse.json({ error: "Missing storage credentials" }, { status: 500 });
  }

  // Define target scanning matrix mappings
  const tiers = [
    { id: "free" as const, bucket: freeBucket },
    { id: "pro" as const, bucket: proBucket }
  ];

  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const discoveredIndexes = [];

  try {
    for (const tier of tiers) {
      if (!tier.bucket) continue;

      // Scan items within this specific storage container context
      const command = new ListObjectsV2Command({
        Bucket: tier.bucket,
        Prefix: "history_cube/", // Target directory containing the master aggregates
      });

      const response = await r2.send(command);
      
      if (!response.Contents) continue;

      for (const object of response.Contents) {
        const key = object.Key || "";
        
        // Match key structures such as: history_cube/era=post_1900/data.parquet
        // This regex extracts the era value dynamically
        const eraMatch = key.match(/history_cube\/era=([^/]+)\/data\.parquet/);
        
        if (eraMatch) {
          const era = eraMatch[1]; // e.g. "post_1900" or "pre_1900"
          
          // Clean up the label for presentation logic UI 
          const cleanEraLabel = era.replace("_", " ");
          const capitalizedLabel = cleanEraLabel.charAt(0).toUpperCase() + cleanEraLabel.slice(1);

          discoveredIndexes.push({
            era: era,
            tier: tier.id,
            label: `${tier.id.toUpperCase()} - ${capitalizedLabel}`,
            // Keep your local client-side filenames strictly deterministic for easy OPFS mapping
            fileName: `index__${tier.id}__${era}.parquet` 
          });
        }
      }
    }

    return NextResponse.json(discoveredIndexes, {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    });

  } catch (err: any) {
    console.error("❌ [SCANNER ERROR] Failed listing remote bucket contents:", err);
    return NextResponse.json({ error: err.message || "Failed scanning storage paths" }, { status: 500 });
  }
}