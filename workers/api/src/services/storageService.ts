/**
 * SiteTrack Pro — Cloudflare Workers R2 Storage Service
 *
 * Handles file storage for CAD drawings, voice DPR photos, and PDF statements
 * directly on Cloudflare R2 with zero egress fees.
 */

export interface UploadOptions {
  bucket: R2Bucket;
  key: string;
  data: ArrayBuffer | ReadableStream;
  contentType: string;
  metadata?: Record<string, string>;
}

export async function uploadToR2({
  bucket,
  key,
  data,
  contentType,
  metadata = {},
}: UploadOptions): Promise<{ key: string; size: number; etag: string }> {
  const object = await bucket.put(key, data, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: metadata,
  });

  return {
    key: object.key,
    size: object.size,
    etag: object.etag,
  };
}

export async function getFromR2(
  bucket: R2Bucket,
  key: string
): Promise<{ body: ReadableStream; contentType: string; size: number } | null> {
  const object = await bucket.get(key);
  if (!object) return null;

  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType || "application/octet-stream",
    size: object.size,
  };
}

export async function deleteFromR2(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

