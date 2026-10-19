import { put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { hasBlobToken, isLocalSharedStoreEnabled } from "./shared-config";

const DATA_DIR = path.join(process.cwd(), ".data", "blobs");

/** Max decoded photo size. Phone photos are compressed client-side well below this. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class PhotoValidationError extends Error {
  status = 400;
}

/** Reject anything that is not a reasonably sized JPEG/PNG/WebP data URL (remote/example paths pass). */
export function assertPhotoDataUrl(value: unknown): void {
  if (typeof value !== "string") throw new PhotoValidationError("Photo is missing");
  if (isRemotePhotoUrl(value)) return;
  const match = value.match(/^data:([^;]+);base64,/);
  if (!match) throw new PhotoValidationError("Photo must be an image upload");
  if (!ALLOWED_PHOTO_TYPES.includes(match[1].toLowerCase())) {
    throw new PhotoValidationError("Photo must be JPEG, PNG, or WebP");
  }
  const approxBytes = Math.floor(((value.length - match[0].length) * 3) / 4);
  if (approxBytes > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError("Photo is too large (max 8 MB)");
  }
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Expected a base64 data URL");
  }
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export function isRemotePhotoUrl(value: string): boolean {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("/photo-examples/") ||
    value.startsWith("/api/shared-files/")
  );
}

export async function persistCheckoutPhoto(
  reportId: string,
  angle: string,
  dataUrlOrPath: string
): Promise<string> {
  if (isRemotePhotoUrl(dataUrlOrPath)) {
    return dataUrlOrPath;
  }

  assertPhotoDataUrl(dataUrlOrPath);
  const { buffer, contentType } = dataUrlToBuffer(dataUrlOrPath);
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const filename = `checkout/${reportId}/${angle}.${ext}`;

  if (hasBlobToken()) {
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: contentType.includes("png")
        ? "image/png"
        : contentType.includes("webp")
          ? "image/webp"
          : "image/jpeg",
      addRandomSuffix: true,
    });
    return blob.url;
  }

  if (isLocalSharedStoreEnabled()) {
    const filePath = path.join(DATA_DIR, filename);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return `/api/shared-files/${filename}`;
  }

  throw new Error(
    "Photo storage is not configured. Set BLOB_READ_WRITE_TOKEN on Vercel."
  );
}
