"use client";

import { createCheckoutReport, markCheckoutSent, uploadCheckoutPhotos } from "./checkout-api";
import {
  CheckoutOutboxItem,
  deliverOutboxItem,
  idempotencyKeyForCheck,
  mergeOutboxAttempt,
  originalDriverFields,
  OutboxPhoto,
  outboxPhoto,
  releaseOutboxForRetry,
} from "./checkout-idempotency";
import {
  deleteCheckoutDraft,
  deleteCheckoutOutboxItem,
  saveCheckoutReport,
  getCheckoutOutboxItem,
  getPendingSyncCount,
  listCheckoutOutbox,
  saveCheckoutOutboxItem,
} from "./storage";
import type { CheckoutReport, CheckoutType, PhotoAngle, PhotoFlagState } from "./types";
import type { CheckoutInspectionForm } from "./inspection-form";
import { driverUploadMessage } from "./delivery-status";
import { compressUploadPhoto } from "./utils";
import { isSendablePhoto } from "./canvas-safe";

let flushing: Promise<number> | null = null;
let askedPersist = false;

/** Ask the browser not to clear this phone's waiting checks when storage runs low. */
function askPersistentStorage() {
  if (askedPersist || typeof navigator === "undefined") return;
  askedPersist = true;
  void navigator.storage?.persist?.().catch(() => false);
}
/**
 * Checks being sent right now. The background retry runs every 15 seconds while
 * the Send screen uploads, so without this both could upload the same check at once.
 */
const inFlight = new Set<string>();

function transport() {
  return {
    create(item: CheckoutOutboxItem) {
      return createCheckoutReport({
        companyId: item.companyId,
        vehicleId: item.vehicleId,
        unitNumber: item.unitNumber,
        plate: item.plate,
        year: item.year,
        make: item.make,
        model: item.model,
        odometer: item.odometer,
        driverName: item.driverName,
        dispatcherName: item.dispatcherName,
        type: item.type,
        inspectionForm: item.inspectionForm,
        signatureDataUrl: item.signatureDataUrl,
        signedAt: item.signedAt,
        idempotencyKey: item.id,
        ...originalDriverFields(item),
      });
    },
    upload(reportId: string, photos: OutboxPhoto[]) {
      return uploadCheckoutPhotos(reportId, photos);
    },
    markSent(reportId: string) {
      return markCheckoutSent(reportId);
    },
    markSentWithoutPhotos(reportId: string) {
      return markCheckoutSent(reportId, { withoutPhotos: true });
    },
  };
}

/** What the upload banner lists: one line per check still on this phone. */
export async function listOutboxForBanner(): Promise<CheckoutOutboxItem[]> {
  return listCheckoutOutbox();
}

/**
 * Office, Manager or Owner removes a stuck check from this phone. The photos on
 * this phone are lost, so the banner asks first. A check already on the server
 * stays there.
 */
export async function clearCheckoutOutboxItem(id: string): Promise<number> {
  if (inFlight.has(id)) throw new Error("This check is uploading right now. Try again in a moment.");
  const item = await getCheckoutOutboxItem(id);
  await deleteCheckoutOutboxItem(id);
  if (item?.draftId) await deleteCheckoutDraft(item.draftId);
  console.info(
    `[outbox] cleared item=${id} server=${item?.serverReportId ?? "none"} unit=${item?.unitNumber ?? "?"}`
  );
  return getPendingSyncCount();
}

/** Send waiting checks now. A stopped upload is released so Retry can try again. */
export async function retryCheckoutOutbox(): Promise<number> {
  const now = new Date().toISOString();
  const items = await listCheckoutOutbox();
  for (const item of items) {
    await saveCheckoutOutboxItem(releaseOutboxForRetry(item, now));
  }
  return flushCheckoutOutbox();
}

/** Send every due outbox item. Returns how many checks are still waiting. */
export function flushCheckoutOutbox(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return getPendingSyncCount();
  }
  if (!flushing) {
    flushing = runFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function runFlush(): Promise<number> {
  const items = await listCheckoutOutbox();
  const now = Date.now();
  for (const item of items) {
    if (inFlight.has(item.id)) continue;
    inFlight.add(item.id);
    let result: Awaited<ReturnType<typeof deliverOutboxItem>>;
    try {
      result = await deliverOutboxItem(item, transport(), saveCheckoutOutboxItem, now);
    } finally {
      inFlight.delete(item.id);
    }
    if (!result.done) continue;
    if (result.report) {
      await saveCheckoutReport({
        ...result.report,
        sentAt: result.report.sentAt || new Date().toISOString(),
      });
    }
    await deleteCheckoutOutboxItem(item.id);
    await deleteCheckoutDraft(item.draftId);
  }
  return getPendingSyncCount();
}

export async function submitCheckoutFromDraft(input: {
  draftId: string;
  companyId: string;
  vehicleId: string;
  unitNumber: string;
  plate?: string;
  year: number;
  make: string;
  model: string;
  odometer: number;
  driverName: string;
  /** Signed-in account doing the check. */
  driverUserId?: string;
  dispatcherName: string;
  type: CheckoutType;
  inspectionForm?: CheckoutInspectionForm;
  signatureDataUrl?: string;
  signedAt?: string;
  photos: Partial<Record<PhotoAngle, string>>;
  photoFlags?: Partial<
    Record<PhotoAngle, PhotoFlagState>
  >;
  onProgress?: (message: string, percent: number) => void;
}): Promise<
  | { state: "sent"; report: CheckoutReport }
  | { state: "saved"; pending: number; error?: string }
> {
  const capturedAt = new Date().toISOString();
  const entries = Object.entries(input.photos).filter(([angle, dataUrl]) => {
    if (!dataUrl) return false;
    if (isSendablePhoto(dataUrl)) return true;
    // An empty "data:," photo (iPhone canvas out of memory) is refused by the
    // server every time and would hold the whole check on this phone forever.
    console.info(`[outbox] skipped unusable photo angle=${angle} chars=${String(dataUrl).length}`);
    return false;
  }) as [PhotoAngle, string][];
  input.onProgress?.("Preparing photos", 5);
  const photos: OutboxPhoto[] = new Array(entries.length);
  let prepared = 0;
  let cursor = 0;
  const workers = Math.min(3, entries.length);
  async function prepareOne(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= entries.length) return;
      const [angle, dataUrl] = entries[index];
      let compressed = dataUrl;
      if (dataUrl.startsWith("data:")) {
        try {
          compressed = await compressUploadPhoto(dataUrl);
        } catch (err) {
          // An old tablet can run out of memory resizing a photo. Send the
          // original instead of failing before the check is queued.
          console.info(`[outbox] compress failed angle=${angle}`, err);
        }
      }
      const flags = input.photoFlags?.[angle];
      photos[index] = outboxPhoto(angle, compressed, capturedAt, flags);
      prepared += 1;
      input.onProgress?.(
        `Preparing photos ${prepared}/${entries.length}`,
        Math.round(5 + (prepared / Math.max(entries.length, 1)) * 25)
      );
    }
  }
  if (workers > 0) {
    await Promise.all(Array.from({ length: workers }, () => prepareOne()));
  }

  const now = new Date().toISOString();
  const key = idempotencyKeyForCheck(input.draftId, input.signedAt);
  const next: CheckoutOutboxItem = {
    id: key,
    draftId: input.draftId,
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    uploadedTokens: {},
    companyId: input.companyId,
    vehicleId: input.vehicleId,
    unitNumber: input.unitNumber,
    plate: input.plate,
    year: input.year,
    make: input.make,
    model: input.model,
    odometer: input.odometer,
    driverName: input.driverName,
    driverUserId: input.driverUserId,
    capturedAt: input.signedAt || now,
    dispatcherName: input.dispatcherName,
    type: input.type,
    inspectionForm: input.inspectionForm,
    signatureDataUrl: input.signatureDataUrl,
    signedAt: input.signedAt,
    photos,
  };
  const item = mergeOutboxAttempt(await getCheckoutOutboxItem(key), next);
  await saveCheckoutOutboxItem(item);
  askPersistentStorage();

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { state: "saved", pending: await getPendingSyncCount() };
  }

  input.onProgress?.("Uploading", 35);
  // A background retry may already be sending this check. Wait for it, then
  // send whatever is left, so two uploads for one check never run at once.
  while (inFlight.has(key)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  inFlight.add(key);
  const latest = await getCheckoutOutboxItem(key);
  const result = latest
    ? await deliverOutboxItem(
    { ...latest, nextAttemptAt: now },
    transport(),
    saveCheckoutOutboxItem,
    Date.now(),
    (uploaded, total) => {
      const percent = total === 0 ? 100 : 35 + Math.round((uploaded / total) * 65);
      input.onProgress?.(
        total === 0 ? "Sending check" : `Uploading photos ${uploaded}/${total}`,
        percent
      );
    }
  ).finally(() => {
    inFlight.delete(key);
  })
    : (inFlight.delete(key), { done: true as const, item, report: undefined });
  if (result.done) {
    if (result.report) {
      await saveCheckoutReport({
        ...result.report,
        sentAt: result.report.sentAt || new Date().toISOString(),
      });
    }
    await deleteCheckoutOutboxItem(item.id);
    await deleteCheckoutDraft(input.draftId);
    if (result.report) return { state: "sent", report: result.report };
    const report = await createCheckoutReport({
      companyId: item.companyId,
      vehicleId: item.vehicleId,
      unitNumber: item.unitNumber,
      plate: item.plate,
      year: item.year,
      make: item.make,
      model: item.model,
      odometer: item.odometer,
      driverName: item.driverName,
      dispatcherName: item.dispatcherName,
      type: item.type,
      inspectionForm: item.inspectionForm,
      signatureDataUrl: item.signatureDataUrl,
      signedAt: item.signedAt,
      idempotencyKey: item.id,
      ...originalDriverFields(item),
    });
    return { state: "sent", report };
  }
  return {
    state: "saved",
    pending: await getPendingSyncCount(),
    error: result.item.lastError ? driverUploadMessage(result.item.lastError) : undefined,
  };
}
