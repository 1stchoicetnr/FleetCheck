/**
 * iPhone (Safari / home-screen app) limits: all canvases on a page share about
 * 384 MB, and a canvas is not freed until Safari gets around to it. Past the
 * limit getContext("2d") returns null and toDataURL returns "data:,". Taking
 * 30 photos in one check can hit that, so every canvas here is released right
 * after use, a null context falls back to the original photo, and nothing waits
 * forever on an image that never loads.
 */

/** A photo the server will accept: a real base64 JPEG/PNG/WebP, not "data:,". */
export function isUsableImageDataUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = value.match(/^data:image\/(jpeg|jpg|png|webp);base64,/i);
  if (!match) return false;
  // A real photo is many KB; a few bytes means the canvas produced nothing.
  return value.length - match[0].length > 64;
}

/**
 * Vercel refuses request bodies over 4.5 MB, so one photo bigger than this can
 * never upload. A resized photo is far smaller; only an unshrunk original is not.
 */
export const MAX_QUEUED_PHOTO_CHARS = 4_000_000;

/** Photos queued for upload can also be links already on the server. */
export function isSendablePhoto(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (isUsableImageDataUrl(value)) return true;
  return /^https?:\/\//i.test(value) || value.startsWith("/photo-examples/") || value.startsWith("/api/");
}

/** Free a canvas's pixels now instead of whenever Safari collects it. */
export function releaseCanvas(canvas: { width: number; height: number; getContext?: (id: "2d") => unknown } | null | undefined): void {
  if (!canvas) return;
  try {
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext?.("2d") as { clearRect?: (x: number, y: number, w: number, h: number) => void } | null | undefined;
    ctx?.clearRect?.(0, 0, 1, 1);
  } catch {
    // Nothing to free.
  }
}

/** Resolve with the fallback if the work has not finished in time. */
export function withFallbackAfter<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, ms);
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}
