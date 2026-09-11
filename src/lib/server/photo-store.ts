import { put } from "@vercel/blob";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { hasBlobToken, useLocalSharedStore } from "./shared-config";

const DATA_DIR = path.join(process.cwd(), ".data", "blobs");

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

  const { buffer, contentType } = dataUrlToBuffer(dataUrlOrPath);
  const filename = `checkout/${reportId}/${angle}.jpg`;

  if (hasBlobToken()) {
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: contentType.includes("png") ? "image/png" : "image/jpeg",
      addRandomSuffix: true,
    });
    return blob.url;
  }

  if (useLocalSharedStore()) {
    const filePath = path.join(DATA_DIR, filename);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return `/api/shared-files/${filename}`;
  }

  throw new Error(
    "Photo storage is not configured. Set BLOB_READ_WRITE_TOKEN on Vercel."
  );
}
