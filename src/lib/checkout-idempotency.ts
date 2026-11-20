import type { CheckoutInspectionForm } from "./inspection-form";
import type { CheckoutReport, CheckoutType, PhotoAngle } from "./types";
import type { PhotoQualityOverride } from "./photo-override";
import { isPhotoWindowClosedError } from "./photo-window";

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
  /** Kept despite a dark/blank/blurry warning. Older queued checks do not have it. */
  qualityOverride?: PhotoQualityOverride;
  qualityOverrideReason?: string;
  /** Answer to a known-damage question on this slot. Older queued checks do not have it. */
  knownDamageId?: string;
  knownDamageAnswer?: "same" | "new";
  knownDamageAnsweredAt?: string;
  damageSpot?: { x: number; y: number };
}

/** One queued photo with the driver's marks. Missing marks (older drafts) stay absent. */
export function outboxPhoto(
  angle: PhotoAngle,
  dataUrl: string,
  capturedAt: string,
  flags?: {
    flaggedDamage?: boolean;
    damageNote?: string;
    qualityNote?: string;
    qualityOverride?: PhotoQualityOverride;
    qualityOverrideReason?: string;
    knownDamageId?: string;
    knownDamageAnswer?: "same" | "new";
    knownDamageAnsweredAt?: string;
  damageSpot?: { x: number; y: number };
  }
): OutboxPhoto {
  return {
    angle,
    dataUrl,
    capturedAt,
    flaggedDamage: flags?.flaggedDamage,
    damageNote: flags?.damageNote,
    qualityNote: flags?.qualityNote,
    qualityOverride: flags?.qualityOverride,
    qualityOverrideReason: flags?.qualityOverrideReason,
    ...(flags?.knownDamageId && flags.knownDamageAnswer
      ? {
          knownDamageId: flags.knownDamageId,
          knownDamageAnswer: flags.knownDamageAnswer,
          knownDamageAnsweredAt: flags.knownDamageAnsweredAt,
        }
      : {}),
    ...(flags?.damageSpot ? { damageSpot: flags.damageSpot } : {}),
  };
}

/** One in-progress submit. The id is the idempotency key. */
export interface CheckoutOutboxItem {
  id: string;
  draftId: string;
  attempts: number;
  nextAttemptAt: string;
  lastError?: string;
  /** HTTP status of the last failure (401 = signed out). */
  lastStatus?: number;
  permanent?: boolean;
  /** The photo window closed, so the check was sent without its photos. */
  sentWithoutPhotos?: boolean;
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
  /** Account that did the check on this phone. Kept when someone else sends it later. */
  driverUserId?: string;
  /** When the driver finished the check on this phone. */
  capturedAt?: string;
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

/**
 * The outbox key for one check. The draft id is the same every time a driver
 * checks the same unit, so the signature time is part of the key: a retry of
 * this check reuses it, and the next check of the same unit gets a new one.
 */
export function idempotencyKeyForCheck(draftId: string, signedAt?: string): string {
  return idempotencyKeyForDraft(signedAt ? `${draftId}|${signedAt}` : draftId);
}

/**
 * A stored check found by key is a retry of this one only when the signature
 * times match (or one side has none, as on older phones). A different time means
 * a new check that reused an old key, so it must not be swallowed by the old row.
 */
export function replayIsSameCheck(
  stored: { signedAt?: string | null },
  incoming: { signedAt?: string | null }
): boolean {
  const a = Date.parse(stored.signedAt ?? "");
  const b = Date.parse(incoming.signedAt ?? "");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return a === b;
}

/** Server-side key for a new check that arrived with an old key (older phones). */
export function followUpIdempotencyKey(key: string, signedAt: string): string {
  const t = Date.parse(signedAt);
  return idempotencyKeyForDraft(`${key}|${Number.isFinite(t) ? new Date(t).toISOString() : signedAt}`);
}

/**
 * Draft id for a new check. The usual id is one per driver, unit and type; when
 * a check under that id is still waiting to send, the new one gets its own id.
 */
export function freshCheckoutDraftId(
  baseId: string,
  waitingDraftIds: string[],
  now = Date.now()
): string {
  if (!waitingDraftIds.includes(baseId)) return baseId;
  return `${baseId}-${now.toString(36)}`;
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

/** Vercel refuses request bodies over 4.5 MB, and a refused batch would never send. */
export const PHOTO_BATCH_MAX_CHARS = 3_000_000;
export const PHOTO_BATCH_MAX_COUNT = 4;

/** Up to 4 photos per request, and never more than about 3 MB of image data. */
export function photoBatches(
  photos: OutboxPhoto[],
  maxChars = PHOTO_BATCH_MAX_CHARS,
  maxCount = PHOTO_BATCH_MAX_COUNT
): OutboxPhoto[][] {
  const batches: OutboxPhoto[][] = [];
  let current: OutboxPhoto[] = [];
  let size = 0;
  for (const photo of photos) {
    const chars = photo.dataUrl.length;
    if (current.length > 0 && (current.length >= maxCount || size + chars > maxChars)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(photo);
    size += chars;
  }
  if (current.length > 0) batches.push(current);
  return batches;
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

/** Mark-sent was refused because a required photo is not on the server. */
export function serverIsMissingPhotos(err: unknown): boolean {
  const message = err instanceof Error ? err.message : "";
  return errorStatus(err) === 409 && /needs its photos/i.test(message);
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
    lastStatus: errorStatus(err),
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
  /** Send without photos after the server closed the driver's photo window. */
  markSentWithoutPhotos?(reportId: string): Promise<CheckoutReport>;
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
    let uploaded = current.photos.length - pending.length;
    onProgress?.(uploaded, current.photos.length);
    for (const slice of photoBatches(pending)) {
      try {
        report = await transport.upload(current.serverReportId as string, slice);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (
          errorStatus(err) === 403 &&
          isPhotoWindowClosedError(message) &&
          transport.markSentWithoutPhotos
        ) {
          // Photos can no longer be added from this phone. Send the check so it
          // stops sitting here; the office sees it as missing photos.
          report = await transport.markSentWithoutPhotos(current.serverReportId as string);
          current = { ...current, sentWithoutPhotos: true, lastError: undefined, lastStatus: undefined };
          await save(current);
          return { done: true, item: current, report };
        }
        throw err;
      }
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
    let failed = scheduleOutboxFailure(current, err, now);
    if (serverIsMissingPhotos(err)) {
      // The server does not have every photo this phone thinks it sent.
      // Send them all again next time. A photo upload replaces by angle.
      failed = { ...failed, uploadedTokens: {} };
    }
    await save(failed);
    return { done: false, item: failed };
  }
}

/** Who and when to send with the create call, so the server keeps the original driver. */
export function originalDriverFields(item: CheckoutOutboxItem): {
  originalDriverUserId?: string;
  originalDriverName?: string;
  capturedAt?: string;
} {
  return {
    originalDriverUserId: item.driverUserId,
    originalDriverName: item.driverName,
    capturedAt: item.capturedAt || item.signedAt || item.createdAt,
  };
}
