import { describe, expect, it } from "vitest";
import { classifyFile, maxSizeForType, MAX_ATTACHMENT_SIZE_BYTES, MAX_VIDEO_SIZE_BYTES, MULTIPART_CHUNK_SIZE_BYTES } from "./validation";

describe("business upload limits", () => {
  it("classifies MP4 and MOV as videos", () => {
    expect(classifyFile("video/mp4")).toBe("VIDEO");
    expect(classifyFile("video/quicktime")).toBe("VIDEO");
  });

  it("uses separate video and attachment limits", () => {
    expect(maxSizeForType("video/mp4")).toBe(MAX_VIDEO_SIZE_BYTES);
    expect(maxSizeForType("application/pdf")).toBe(MAX_ATTACHMENT_SIZE_BYTES);
    expect(MAX_VIDEO_SIZE_BYTES).toBe(500 * 1024 * 1024);
    expect(MULTIPART_CHUNK_SIZE_BYTES).toBe(16 * 1024 * 1024);
  });
});
