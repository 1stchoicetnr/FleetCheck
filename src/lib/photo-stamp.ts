import { formatCheckoutTime } from "./checkout-slack.ts";
import { isUsableImageDataUrl, releaseCanvas, withFallbackAfter } from "./canvas-safe.ts";

/** Pacific time burned onto a live capture, same clock as Slack and the PDF. */
export function photoStampLabel(iso: string): string {
  return formatCheckoutTime(iso);
}

export async function stampPhotoDataUrl(dataUrl: string, iso: string): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  return withFallbackAfter(stampNow(dataUrl, iso), STAMP_TIMEOUT_MS, dataUrl);
}

/** A stamp that cannot finish keeps the plain photo instead of a stuck Capture button. */
export const STAMP_TIMEOUT_MS = 15_000;

async function stampNow(dataUrl: string, iso: string): Promise<string> {
  const label = photoStampLabel(iso);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("photo"));
    image.src = dataUrl;
  });
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return dataUrl;
  const canvas = document.createElement("canvas");
  try {
    canvas.width = width;
    canvas.height = height;
    // iPhone returns null once its canvas memory is used up.
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(image, 0, 0, width, height);
    const bar = Math.max(28, Math.round(height * 0.07));
    const font = Math.max(16, Math.round(bar * 0.46));
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, height - bar, width, bar);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${font}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(label, Math.round(font * 0.4), height - bar / 2);
    const out = canvas.toDataURL("image/jpeg", 0.9);
    return isUsableImageDataUrl(out) ? out : dataUrl;
  } finally {
    releaseCanvas(canvas);
  }
}
