/** Reports created before this were already in Office. They count as sent. */
export const HISTORICAL_SENT_BEFORE = "2026-10-20T19:45:00.000Z";

export const STUCK_UPLOAD_AFTER_MS = 30 * 60 * 1000;

export type DeliveryState = "saved" | "uploading" | "sent" | "stuck";

export interface DeliveryView {
  state: DeliveryState;
  label: string;
  at: string;
}

export function deliveryView(input: {
  createdAt: string;
  sentAt?: string | null;
  /** Still only on this phone. The office row does not exist yet. */
  localOnly?: boolean;
  /** Create or photo upload has not finished. Never show this as sent. */
  unfinished?: boolean;
  now?: number;
}): DeliveryView {
  if (input.unfinished) {
    return {
      state: "stuck",
      label: "Didn't finish uploading",
      at: input.createdAt,
    };
  }
  if (input.localOnly) {
    return { state: "saved", label: "Saved on phone", at: input.createdAt };
  }
  if (input.sentAt) {
    return { state: "sent", label: "Sent", at: input.sentAt };
  }
  const created = Date.parse(input.createdAt);
  const historical = Date.parse(HISTORICAL_SENT_BEFORE);
  if (Number.isFinite(created) && created < historical) {
    return { state: "sent", label: "Sent", at: input.createdAt };
  }
  const now = input.now ?? Date.now();
  if (Number.isFinite(created) && now - created >= STUCK_UPLOAD_AFTER_MS) {
    return { state: "stuck", label: "Stuck", at: input.createdAt };
  }
  return { state: "uploading", label: "Uploading", at: input.createdAt };
}

export function isStuckUpload(
  report: { createdAt: string; sentAt?: string | null; archivedAt?: string | null },
  now = Date.now()
): boolean {
  if (report.archivedAt || report.sentAt) return false;
  return deliveryView({ createdAt: report.createdAt, now }).state === "stuck";
}
