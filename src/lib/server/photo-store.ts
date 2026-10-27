import { del, get, put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { checkoutObjectPath } from "./org-scope";
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
  orgId: string,
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
  const filename = checkoutObjectPath(orgId, reportId, angle, ext);

  if (hasBlobToken()) {
    const blob = await put(filename, buffer, {
      access: "private",
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

/** Public blob hosts stay readable by URL. Private hosts need the blob token. */
export function blobAccessKind(url: string): "public" | "private" | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".private.blob.vercel-storage.com")) return "private";
  if (host === "blob.vercel-storage.com" || host.endsWith(".blob.vercel-storage.com")) {
    return "public";
  }
  return null;
}

export type StoredPhotoBytes = { bytes: Uint8Array; contentType: string };

export type StoredPhotoIo = {
  fetchPublic: (url: string) => Promise<StoredPhotoBytes>;
  readPrivate: (url: string) => Promise<StoredPhotoBytes>;
};

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    total += next.value.byteLength;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function fetchPublicPhoto(url: string): Promise<StoredPhotoBytes> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Could not load stored photo (${response.status})`);
  const contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
}

async function readPrivateBlob(url: string): Promise<StoredPhotoBytes> {
  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error("Could not load stored photo");
  }
  return {
    bytes: await streamToBytes(result.stream),
    contentType: result.blob.contentType || "image/jpeg",
  };
}

/**
 * Read a stored checkout photo.
 * Public blobs still load by URL so older checks keep working.
 * Private blobs load with the store token. A public URL that no longer opens
 * is tried once as a private blob before it fails.
 */
export async function readStoredPhotoBytes(
  url: string,
  io?: Partial<StoredPhotoIo>
): Promise<StoredPhotoBytes> {
  const fetchPublic = io?.fetchPublic ?? fetchPublicPhoto;
  const readPrivate = io?.readPrivate ?? readPrivateBlob;
  const kind = blobAccessKind(url);
  if (kind === "private") return readPrivate(url);
  if (kind === "public") {
    try {
      return await fetchPublic(url);
    } catch (err) {
      if (!hasBlobToken() && !io?.readPrivate) throw err;
      try {
        return await readPrivate(url);
      } catch {
        throw err;
      }
    }
  }
  return fetchPublic(url);
}

/** Best-effort removal of a stored checkout photo. Missing files are ignored. */
export async function deleteStoredPhoto(url: string | undefined): Promise<void> {
  if (!url || url.startsWith("/photo-examples/") || url.startsWith("/api/shared-files/")) {
    return;
  }
  if (!hasBlobToken() || !url.startsWith("http")) return;
  try {
    await del(url);
  } catch (err) {
    console.error("[photos] delete failed:", err);
  }
}
