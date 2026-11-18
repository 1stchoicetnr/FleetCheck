import { missingRequiredPhotos } from "./checkout-completion";
import { photoStepsForClient, stuckReason } from "./legacy-checkout";
import type { CheckoutReport, PhotoStep } from "./types";

/** A check counts as stuck once it has sat unsent this long. */
export const STUCK_AFTER_MS = 30 * 60 * 1000;
export const STUCK_LOOKBACK_DAYS = 14;

export interface StuckCheckRow {
  id: string;
  unit: string;
  driver: string;
  /** When the server first saw the check. */
  createdAt: string;
  /** When the driver did it (shown time). */
  completedAt: string;
  sentAt?: string;
  missingPhotos: number;
  hoursWaiting: number;
  reason: string;
}

export type StuckCandidate = Pick<
  CheckoutReport,
  | "id"
  | "unitNumber"
  | "plate"
  | "driverName"
  | "companyId"
  | "createdAt"
  | "completedAt"
  | "sentAt"
  | "archivedAt"
  | "idempotencyKey"
  | "inspectionForm"
  | "photos"
>;

/**
 * Read-only office view: checks that never reached "sent" (stuck), and checks
 * that were sent while required photos were missing.
 */
export function classifyStuckChecks(
  reports: StuckCandidate[],
  stepsFor: (companyId: string) => PhotoStep[] | undefined,
  now = Date.now()
): { stuck: StuckCheckRow[]; sentWithoutPhotos: StuckCheckRow[] } {
  const stuck: StuckCheckRow[] = [];
  const sentWithoutPhotos: StuckCheckRow[] = [];
  for (const report of reports) {
    if (report.archivedAt) continue;
    const steps = stepsFor(report.companyId);
    const missing = steps
      ? missingRequiredPhotos(report, photoStepsForClient(report, steps)).length
      : 0;
    const created = Date.parse(report.createdAt);
    const waitingMs = Number.isFinite(created) ? now - created : 0;
    const row: StuckCheckRow = {
      id: report.id,
      unit: report.unitNumber,
      driver: report.driverName,
      createdAt: report.createdAt,
      completedAt: report.completedAt,
      sentAt: report.sentAt || undefined,
      missingPhotos: missing,
      hoursWaiting: Math.round((waitingMs / 3_600_000) * 10) / 10,
      reason: "",
    };
    if (!report.sentAt) {
      if (waitingMs < STUCK_AFTER_MS) continue;
      row.reason =
        stuckReason(report, steps, now) ||
        (missing > 0 ? `Missing ${missing} photo${missing === 1 ? "" : "s"}` : "Not sent yet");
      stuck.push(row);
    } else if (missing > 0) {
      row.reason = `Sent without ${missing} required photo${missing === 1 ? "" : "s"}`;
      sentWithoutPhotos.push(row);
    }
  }
  return { stuck, sentWithoutPhotos };
}
