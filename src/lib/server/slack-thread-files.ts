import { SlackDeliveryError } from "../checkout-slack";
import {
  checkoutThreadFilePlan,
  type SlackThreadFile,
} from "../slack-files";
import type { SlackBinaryFile } from "../slack-upload";
import type { CheckoutReport, PhotoStep } from "../types";
import { blobAccessKind, readStoredPhotoBytes } from "./photo-store";
import { checkoutReportPdfBytes } from "./pdf-runtime";

function extension(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("pdf")) return "pdf";
  return "jpg";
}

function dataUrlBytes(value: string): { bytes: Uint8Array; contentType: string } | undefined {
  const match = /^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return undefined;
  return {
    contentType: match[1].toLowerCase(),
    bytes: Buffer.from(match[2], "base64"),
  };
}

async function loadRemote(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new SlackDeliveryError("timeout");
    throw new SlackDeliveryError("network");
  }
  if (response.status === 429) throw new SlackDeliveryError("HTTP 429");
  if (!response.ok) throw new SlackDeliveryError(`HTTP ${response.status || 0}`);
  const contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
}

async function loadPhoto(src: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const inline = dataUrlBytes(src);
  if (inline) return inline;
  if (blobAccessKind(src)) {
    try {
      return await readStoredPhotoBytes(src);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "TimeoutError" || name === "AbortError") throw new SlackDeliveryError("timeout");
      throw new SlackDeliveryError("network");
    }
  }
  if (src.startsWith("http://") || src.startsWith("https://")) return loadRemote(src);
  throw new SlackDeliveryError("file missing");
}

function withExtension(file: SlackThreadFile, contentType: string): string {
  if (file.filename.endsWith(".pdf")) return file.filename;
  return `${file.filename}.${extension(contentType)}`;
}

/** PDF bytes plus the photo files still waiting to upload. */
export async function loadCheckoutThreadFiles(
  report: CheckoutReport,
  keys: string[],
  steps?: PhotoStep[]
): Promise<SlackBinaryFile[]> {
  const wanted = new Set(keys);
  const plan = checkoutThreadFilePlan(report, steps).filter((file) => wanted.has(file.key));
  const photos = new Map(report.photos.map((photo) => [photo.angle, photo]));
  const files: SlackBinaryFile[] = [];
  for (const file of plan) {
    if (file.key === "pdf") {
      const bytes = await checkoutReportPdfBytes(report, { plate: report.plate, steps });
      files.push({ ...file, bytes, contentType: "application/pdf" });
      continue;
    }
    const photo = photos.get(file.key as (typeof report.photos)[number]["angle"]);
    if (!photo?.dataUrl) throw new SlackDeliveryError("file missing");
    const loaded = await loadPhoto(photo.dataUrl);
    files.push({
      ...file,
      filename: withExtension(file, loaded.contentType),
      bytes: loaded.bytes,
      contentType: loaded.contentType,
    });
  }
  return files;
}
