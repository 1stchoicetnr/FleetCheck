/** A rectangle on a photo. x and y are the left and top edges; w and h are the size. All four are fractions of the photo, 0..1. */
export interface ChangeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** JPEG orientation tag. 1 is already upright. */
export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const MIN_EDGE = 0.012;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 0–1000 model units, and raw pixel values, become fractions. Numbers already near 0–1 stay. */
function scaleToUnit(values: number[]): number[] {
  const max = Math.max(...values.map((n) => Math.abs(n)));
  if (max <= 1.5) return values;
  const divisor = max <= 1000 ? 1000 : max;
  return values.map((n) => n / divisor);
}

function fitBox(x: number, y: number, w: number, h: number): ChangeBox | undefined {
  let left = x;
  let top = y;
  let width = w;
  let height = h;
  // w/h were the right and bottom edges, so the rectangle runs off the photo on both axes.
  const pastRight = left + width > 1.02;
  const pastBottom = top + height > 1.02;
  if (pastRight && pastBottom && width > left && height > top) {
    width = width - left;
    height = height - top;
  }
  if (![left, top, width, height].every((n) => Number.isFinite(n))) return undefined;
  left = Math.min(1, Math.max(0, left));
  top = Math.min(1, Math.max(0, top));
  width = Math.min(1 - left, Math.max(0, width));
  height = Math.min(1 - top, Math.max(0, height));
  if (width < MIN_EDGE || height < MIN_EDGE) return undefined;
  if (width > 0.98 && height > 0.98) return undefined;
  return { x: round4(left), y: round4(top), w: round4(width), h: round4(height) };
}

function fromCorners(x1: number, y1: number, x2: number, y2: number): ChangeBox | undefined {
  const [left, top, right, bottom] = scaleToUnit([x1, y1, x2, y2]);
  if (right <= left || bottom <= top) return undefined;
  return fitBox(left, top, right - left, bottom - top);
}

/**
 * One box, whatever shape the model used: x/y/w/h, x1/y1/x2/y2, Gemini
 * [ymin, xmin, ymax, xmax], or 0–1000 instead of 0–1. A box with no area,
 * or one that covers the whole photo, is dropped.
 */
export function normalizeChangeBox(raw: unknown): ChangeBox | undefined {
  if (Array.isArray(raw)) {
    if (raw.length < 4) return undefined;
    const nums = raw.slice(0, 4).map(finite);
    if (nums.some((n) => n == null)) return undefined;
    const [ymin, xmin, ymax, xmax] = nums as number[];
    return fromCorners(xmin, ymin, xmax, ymax);
  }
  if (!raw || typeof raw !== "object") return undefined;
  const box = raw as Record<string, unknown>;
  const ymin = finite(box.ymin);
  const xmin = finite(box.xmin);
  const ymax = finite(box.ymax);
  const xmax = finite(box.xmax);
  if (ymin != null && xmin != null && ymax != null && xmax != null) {
    return fromCorners(xmin, ymin, xmax, ymax);
  }
  const x1 = finite(box.x1 ?? box.left);
  const y1 = finite(box.y1 ?? box.top);
  const x2 = finite(box.x2 ?? box.right);
  const y2 = finite(box.y2 ?? box.bottom);
  if (x1 != null && y1 != null && x2 != null && y2 != null && !("w" in box) && !("h" in box)) {
    return fromCorners(x1, y1, x2, y2);
  }
  const x = finite(box.x);
  const y = finite(box.y);
  const w = finite(box.w);
  const h = finite(box.h);
  if (x == null || y == null || w == null || h == null) return undefined;
  const [sx, sy, sw, sh] = scaleToUnit([x, y, w, h]);
  return fitBox(sx, sy, sw, sh);
}

function mapPoint(x: number, y: number, orientation: ExifOrientation): { x: number; y: number } {
  switch (orientation) {
    case 1:
      return { x, y };
    case 2:
      return { x: 1 - x, y };
    case 3:
      return { x: 1 - x, y: 1 - y };
    case 4:
      return { x, y: 1 - y };
    case 5:
      return { x: y, y: x };
    case 6:
      return { x: 1 - y, y: x };
    case 7:
      return { x: 1 - y, y: 1 - x };
    case 8:
      return { x: y, y: 1 - x };
    default: {
      const unknown: never = orientation;
      return unknown;
    }
  }
}

/**
 * Move a box from the JPEG's stored pixel grid into the upright photo a phone
 * shows. Orientation 1 is unchanged. The upload canvas bakes this in for new
 * photos; this is for a file that still carries the tag.
 */
export function boxForDisplayedOrientation(box: ChangeBox, orientation: number): ChangeBox {
  if (orientation === 1 || orientation < 1 || orientation > 8) return box;
  const known = orientation as ExifOrientation;
  const corners = [
    mapPoint(box.x, box.y, known),
    mapPoint(box.x + box.w, box.y, known),
    mapPoint(box.x, box.y + box.h, known),
    mapPoint(box.x + box.w, box.y + box.h, known),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return fitBox(left, top, Math.max(...xs) - left, Math.max(...ys) - top) ?? box;
}
