import type { CheckoutInspectionForm } from "./inspection-form";
import type { CheckoutReport, CheckoutType, PhotoAngle } from "./types";

/** Client key sent with a check so a retry returns the original row. */
export const IDEMPOTENCY_KEY_RE = /^chk-[A-Za-z0-9_-]{8,76}$/;

/** A jpeg already under this size was compressed on the phone. */
export const PHOTO_UPLOAD_SKIP_RECOMPRESS_BYTES = 380_000;

export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  if (!b64) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function alreadyUploadReady(dataUrl: string): boolean {
  return (
    dataUrl.startsWith("data:image/jpeg") &&
    dataUrlBytes(dataUrl) > 0 &&
    dataUrlBytes(dataUrl) <= PHOTO_UPLOAD_SKIP_RECOMPRESS_BYTES
  );
}

const BACKOFF_MS = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000];
const PERMANENT_DELAY_MS = 24 * 60 * 60 * 1000;

export interface OutboxPhoto {
  angle: PhotoAngle;
  dataUrl: string;
  capturedAt: string;
  flaggedDamage?: boolean;
  damageNote?: string;
  qualityNote?: string;
}

/** One in-progress submit. The id is the idempotency key. */
export interface CheckoutOutboxItem {
  id: string;
  draftId: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  permanent?: boolean;
  createdAt: string;
  serverReportId?: string;
  uploadedTokens: Partial<Record<PhotoAngle, string>>;
  companyId: string;
  vehicleId: string;
  unitNumber: string;
  plate?: string;
  year: number;
  make: string;
  model: string;
  odometer: number;
  driverName: string;
  dispatcherName: string;
  type: CheckoutType;
  inspectionForm?: CheckoutInspectionForm;
  signatureDataUrl?: string;
  signedAt?: string;
  photos: OutboxPhoto[];
}

export function idempotencyKeyForDraft(draftId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < draftId.length; i += 1) {
    hash ^= draftId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  const safe = draftId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
  const key = `chk-${safe}-${hex}`.slice(0, 80);
  if (IDEMPOTENCY_KEY_RE.test(key)) return key;
  return `chk-${hex}${hex}`;
}

export function assertIdempotencyKey(key: string): void {
  if (!IDEMPOTENCY_KEY_RE.test(key)) {
    throw new Error("Idempotency key is invalid");
  }
}

export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const bag = err as {
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  const code = bag.code || bag.cause?.code;
  if (code === "23505") return true;
  const message = `${bag.message || ""} ${bag.cause?.message || ""}`;
  return /duplicate key|unique constraint/i.test(message);
}

export function photoToken(dataUrl: string): string {
  return `${dataUrl.length}:${dataUrl.slice(-24)}`;
}

export function pendingOutboxPhotos(item: CheckoutOutboxItem): OutboxPhoto[] {
  return item.photos.filter(
    (photo) => item.uploadedTokens[photo.angle] !== photoToken(photo.dataUrl)
  );
}

export function outboxIsDue(item: CheckoutOutboxItem, now: number): boolean {
  if (item.permanent) return false;
  const at = Date.parse(item.nextAttemptAt);
  return !Number.isFinite(at) || at <= now;
}

export function failureDelay(previousAttempts: number, permanent: boolean): number {
  if (permanent) return PERMANENT_DELAY_MS;
  const index = Math.min(Math.max(previousAttempts, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}

export function isPermanentOutboxError(
  status: number | undefined,
  message: string
): boolean {
  if (status === 401 || status === 408 || status === 429) return false;
  if (message.includes("Sign in first")) return false;
  // Photos can still be landing. Keep trying instead of stopping the phone.
  if (status === 409 && /needs its photos/i.test(message)) return false;
  if (status && status >= 400 && status < 500) return true;
  return /idempotency key is invalid|missing required|signature image is invalid|unknown photo angle/i.test(
    message
  );
}

export function errorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object" || !("status" in err)) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

export function scheduleOutboxFailure(
  item: CheckoutOutboxItem,
  err: unknown,
  now: number
): CheckoutOutboxItem {
  const message = err instanceof Error ? err.message : "Upload failed";
  const permanent = isPermanentOutboxError(errorStatus(err), message);
  const delay = failureDelay(item.attempts, permanent);
  return {
    ...item,
    attempts: item.attempts + 1,
    permanent,
    lastError: message,
    nextAttemptAt: new Date(now + delay).toISOString(),
  };
}

/** A Retry tap sends the waiting check now, including one that had stopped. */
export function releaseOutboxForRetry(
  item: CheckoutOutboxItem,
  nowIso: string
): CheckoutOutboxItem {
  return {
    ...item,
    permanent: false,
    nextAttemptAt: nowIso,
  };
}

/** A fresh tap submits the latest photos but keeps the server row from the first try. */
export function mergeOutboxAttempt(
  previous: CheckoutOutboxItem | undefined,
  next: CheckoutOutboxItem
): CheckoutOutboxItem {
  if (!previous) return next;
  return {
    ...next,
    attempts: 0,
    permanent: false,
    lastError: undefined,
    createdAt: previous.createdAt,
    serverReportId: previous.serverReportId,
    uploadedTokens: previous.uploadedTokens,
    nextAttemptAt: next.nextAttemptAt,
  };
}

export interface OutboxTransport {
  create(item: CheckoutOutboxItem): Promise<CheckoutReport>;
  upload(reportId: string, photos: OutboxPhoto[]): Promise<CheckoutReport>;
  markSent?(reportId: string): Promise<CheckoutReport>;
}

export async function deliverOutboxItem(
  item: CheckoutOutboxItem,
  transport: OutboxTransport,
  save: (item: CheckoutOutboxItem) => Promise<void>,
  now = Date.now(),
  onProgress?: (uploaded: number, total: number) => void
): Promise<{ done: boolean; item: CheckoutOutboxItem; report?: CheckoutReport }> {
  if (!outboxIsDue(item, now)) return { done: false, item };

  let current = item;
  let report: CheckoutReport | undefined;
  try {
    if (!current.serverReportId) {
      report = await transport.create(current);
      current = { ...current, serverReportId: report.id, lastError: undefined };
      await save(current);
    }
    const pending = pendingOutboxPhotos(current);
    const batchSize = 4;
    let uploaded = current.photos.length - pending.length;
    onProgress?.(uploaded, current.photos.length);
    for (let i = 0; i < pending.length; i += batchSize) {
      const slice = pending.slice(i, i + batchSize);
      report = await transport.upload(current.serverReportId as string, slice);
      const uploadedTokens = { ...current.uploadedTokens };
      for (const photo of slice) {
        uploadedTokens[photo.angle] = photoToken(photo.dataUrl);
      }
      uploaded += slice.length;
      current = { ...current, uploadedTokens, lastError: undefined };
      await save(current);
      onProgress?.(uploaded, current.photos.length);
    }
    if (transport.markSent && current.serverReportId) {
      report = await transport.markSent(current.serverReportId);
    }
    return { done: true, item: current, report };
  } catch (err) {
    const failed = scheduleOutboxFailure(current, err, now);
    await save(failed);
    return { done: false, item: failed };
  }
}
