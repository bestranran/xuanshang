export const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;
export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;
// Kept for the legacy standalone uploader.
export const MAX_FILE_SIZE_BYTES = MAX_ATTACHMENT_SIZE_BYTES;
export const MULTIPART_CHUNK_SIZE_BYTES = 16 * 1024 * 1024;
export const MAX_ACTIVE_UPLOADS_PER_USER = 2;
export const MAX_VIDEOS_PER_VERSION = 1;
export const MAX_ATTACHMENTS_PER_VERSION = 5;
export const ALLOWED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "video/quicktime",
  "video/mp4",
] as const;

export const VIDEO_FILE_TYPES = ["video/quicktime", "video/mp4"] as const;

export function classifyFile(type: string) {
  return (VIDEO_FILE_TYPES as readonly string[]).includes(type) ? "VIDEO" as const : "ATTACHMENT" as const;
}

export function maxSizeForType(type: string) {
  return classifyFile(type) === "VIDEO" ? MAX_VIDEO_SIZE_BYTES : MAX_ATTACHMENT_SIZE_BYTES;
}
