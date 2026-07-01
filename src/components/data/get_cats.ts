import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

// Initialize the Cloudflare R2 Client via standard S3 API mappings
const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // e.g., https://<account-id>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function fetchAvailableCategories(bucketName: string): Promise<string[]> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: "master_category=", // Only look at partitioned paths
    });

    const response = await r2Client.send(command);
    const categories = new Set<string>();

    if (response.Contents) {
      for (const object of response.Contents) {
        if (!object.Key) continue;
        
        // Match string between 'master_category=' and the next trailing slash '/'
        const match = object.Key.match(/master_category=([^/]+)/);
        if (match && match[1]) {
          categories.add(match[1]); // Adds cleanly (e.g. "castles")
        }
      }
    }

    // Return sorted alphabetical unique array listing
    return Array.from(categories).sort();
  } catch (error) {
    console.error(`❌ Failed scanning R2 Bucket "${bucketName}":`, error);
    return [];
  }
}