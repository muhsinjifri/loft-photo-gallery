export async function putBlob(bucket: R2Bucket, key: string, blob: Blob): Promise<void> {
  await bucket.put(key, blob.stream(), {
    httpMetadata: { contentType: blob.type || "application/octet-stream" },
  });
}

export async function deleteMany(bucket: R2Bucket, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await bucket.delete(keys);
}
