"use client";

import { createCheckoutReport, markCheckoutSent, uploadCheckoutPhotos } from "./checkout-api";
import {
  CheckoutOutboxItem,
  deliverOutboxItem,
  idempotencyKeyForDraft,
  mergeOutboxAttempt,
  OutboxPhoto,
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
import type { CheckoutReport, CheckoutType, PhotoAngle } from "./types";
import type { CheckoutInspectionForm } from "./inspection-form";
import { driverUploadMessage } from "./delivery-status";
import { compressUploadPhoto } from "./utils";

let flushing: Promise<number> | null = null;

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
      });
    },
    upload(reportId: string, photos: OutboxPhoto[]) {
      return uploadCheckoutPhotos(reportId, photos);
    },
    markSent(reportId: string) {
      return markCheckoutSent(reportId);
    },
  };
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
    const result = await deliverOutboxItem(item, transport(), saveCheckoutOutboxItem, now);
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
  dispatcherName: string;
  type: CheckoutType;
  inspectionForm?: CheckoutInspectionForm;
  signatureDataUrl?: string;
  signedAt?: string;
  photos: Partial<Record<PhotoAngle, string>>;
  photoFlags?: Partial<
    Record<PhotoAngle, { flaggedDamage: boolean; damageNote?: string; qualityNote?: string }>
  >;
  onProgress?: (message: string, percent: number) => void;
}): Promise<
  | { state: "sent"; report: CheckoutReport }
  | { state: "saved"; pending: number; error?: string }
> {
  const capturedAt = new Date().toISOString();
  const entries = Object.entries(input.photos).filter(([, dataUrl]) => dataUrl) as [
    PhotoAngle,
    string,
  ][];
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
      const compressed = dataUrl.startsWith("data:")
        ? await compressUploadPhoto(dataUrl)
        : dataUrl;
      const flags = input.photoFlags?.[angle];
      photos[index] = {
        angle,
        dataUrl: compressed,
        capturedAt,
        flaggedDamage: flags?.flaggedDamage,
        damageNote: flags?.damageNote,
        qualityNote: flags?.qualityNote,
      };
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
  const key = idempotencyKeyForDraft(input.draftId);
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
    dispatcherName: input.dispatcherName,
    type: input.type,
    inspectionForm: input.inspectionForm,
    signatureDataUrl: input.signatureDataUrl,
    signedAt: input.signedAt,
    photos,
  };
  const item = mergeOutboxAttempt(await getCheckoutOutboxItem(key), next);
  await saveCheckoutOutboxItem(item);

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { state: "saved", pending: await getPendingSyncCount() };
  }

  input.onProgress?.("Uploading", 35);
  const result = await deliverOutboxItem(
    item,
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
  );
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
    });
    return { state: "sent", report };
  }
  return {
    state: "saved",
    pending: await getPendingSyncCount(),
    error: result.item.lastError ? driverUploadMessage(result.item.lastError) : undefined,
  };
}
