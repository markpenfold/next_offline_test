import { S3Client } from "@aws-sdk/client-s3";

if (!process.env.R2_ACCOUNT_ID || !process.env.R2_BLOG_ACCESS_KEY || !process.env.R2_BLOG_SECRET_KEY) {
  throw new Error("Missing Cloudflare R2 environment variables");
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_BLOG_ACCESS_KEY,
    secretAccessKey: process.env.R2_BLOG_SECRET_KEY,
  },
});

export const BUCKET_NAME = process.env.R2_USERCONTENT_BUCKET_NAME || "user-content";