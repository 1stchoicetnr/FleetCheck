import { readFile } from "node:fs/promises";
import path from "node:path";
import { imageSizeFromDataUrl } from "@/lib/image-size";
import type { CheckoutPdfOptions } from "@/lib/pdf";
import { blobAccessKind, readStoredPhotoBytes } from "@/lib/server/photo-store";
import type { CheckoutReport } from "@/lib/types";

class ServerFileReader {
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;

  readAsDataURL(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        const type = blob.type || "application/octet-stream";
        this.result = `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload?.();
      })
      .catch((error) => this.onerror?.(error));
  }
}

class ServerImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(value: string) {
    const size = imageSizeFromDataUrl(value);
    if (!size || size.width < 1 || size.height < 1) {
      queueMicrotask(() => this.onerror?.());
      return;
    }
    this.naturalWidth = size.width;
    this.naturalHeight = size.height;
    queueMicrotask(() => this.onload?.());
  }
}

function installPdfPolyfills(): void {
  const globals = globalThis as { FileReader?: unknown; Image?: unknown };
  if (typeof globals.FileReader === "undefined") {
    globals.FileReader = ServerFileReader;
  }
  if (typeof globals.Image === "undefined") {
    globals.Image = ServerImage;
  }
}

async function defaultLogoDataUrl(): Promise<string | undefined> {
  try {
    const file = await readFile(path.join(process.cwd(), "public/icons/icon-192.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return undefined;
  }
}

function photoDataUrl(bytes: Uint8Array, contentType: string): string {
  const type = contentType.startsWith("image/") ? contentType : "image/jpeg";
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** Turn stored blob addresses into data URLs before the shared PDF builder runs. */
async function embedStoredPhotos(report: CheckoutReport): Promise<CheckoutReport> {
  const photos = await Promise.all(
    report.photos.map(async (photo) => {
      if (!photo.dataUrl || !blobAccessKind(photo.dataUrl)) return photo;
      const loaded = await readStoredPhotoBytes(photo.dataUrl);
      return { ...photo, dataUrl: photoDataUrl(loaded.bytes, loaded.contentType) };
    })
  );
  let signatureDataUrl = report.signatureDataUrl;
  if (signatureDataUrl && blobAccessKind(signatureDataUrl)) {
    const loaded = await readStoredPhotoBytes(signatureDataUrl);
    signatureDataUrl = photoDataUrl(loaded.bytes, loaded.contentType);
  }
  return { ...report, photos, signatureDataUrl };
}

export async function checkoutReportPdfBytes(
  report: CheckoutReport,
  options: CheckoutPdfOptions = {}
): Promise<Uint8Array> {
  installPdfPolyfills();
  const logo = options.logoDataUrl || (await defaultLogoDataUrl());
  const { generateCheckoutReportPDF } = await import("@/lib/pdf");
  const blob = await generateCheckoutReportPDF(await embedStoredPhotos(report), {
    ...options,
    logoDataUrl: logo,
  });
  return new Uint8Array(await blob.arrayBuffer());
}
