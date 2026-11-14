export function getBucketName(): string {
  const bucketName = process.env.R2_USERCONTENT_BUCKET_NAME;
  if (!bucketName) {
    throw new Error('Missing R2_USERCONTENT_BUCKET_NAME.');
  }
  return bucketName;
}