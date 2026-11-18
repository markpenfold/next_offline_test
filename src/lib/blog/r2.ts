import { S3Client } from "@aws-sdk/client-s3";

let _r2Client: S3Client | null = null;

function getR2Client(): S3Client {
  if (_r2Client) return _r2Client;

  if (
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_BLOG_ACCESS_KEY ||
    !process.env.R2_BLOG_SECRET_KEY
  ) {
    throw new Error("Missing Cloudflare R2 environment variables");
  }

  _r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_BLOG_ACCESS_KEY,
      secretAccessKey: process.env.R2_BLOG_SECRET_KEY,
    },
  });

  return _r2Client;
}

export const r2Client = new Proxy({} as S3Client, {
  get(_, prop) {
    const client = getR2Client();
    const value = client[prop as keyof S3Client];
    return typeof value === "function" ? value.bind(client) : value;
  },
});