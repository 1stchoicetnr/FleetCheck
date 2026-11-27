import { missingRequiredPhotos } from "./checkout-completion";
import { HISTORICAL_SENT_BEFORE, STUCK_UPLOAD_AFTER_MS } from "./delivery-status";
import type { CheckoutReport, PhotoAngle, PhotoStep } from "./types";

/**
 * Phones still running the app from before Oct 20 (commit a3870ff) create a
 * check with no idempotency key, never send the "sent" step, and have no
 * insurance photo step. Every current build sends an idempotency key.
 */
export function isLegacyClientReport(
  report: Pick<CheckoutReport, "idempotencyKey" | "createdAt">
): boolean {
  if (report.idempotencyKey) return false;
  const created = Date.parse(report.createdAt);
  return !Number.isFinite(created) || created >= Date.parse(HISTORICAL_SENT_BEFORE);
}

/** Photo slots that did not exist in the old app. Insurance became required Oct 21 (1f8a5af). */
export const LEGACY_MISSING_ANGLES: PhotoAngle[] = ["insurance"];

const ANGLE_LABEL: Partial<Record<PhotoAngle, string>> = { insurance: "insurance" };

/** Photo steps as they apply to this check. Old-app checks treat newer slots as optional. */
export function photoStepsForClient(
  report: Pick<CheckoutReport, "idempotencyKey" | "createdAt">,
  steps: PhotoStep[]
): PhotoStep[] {
  if (!isLegacyClientReport(report)) return steps;
  return steps.map((step) =>
    LEGACY_MISSING_ANGLES.includes(step.angle) ? { ...step, required: false } : step
  );
}

/** Notes such as "Missing insurance photo (old app)" for newer slots an old-app check skipped. */
export function legacyMissingNotes(
  report: Pick<CheckoutReport, "idempotencyKey" | "createdAt" | "photos" | "inspectionForm">,
  steps: PhotoStep[]
): string[] {
  if (!isLegacyClientReport(report)) return [];
  const required = steps.filter((s) => s.required && LEGACY_MISSING_ANGLES.includes(s.angle));
  const missing = missingRequiredPhotos(report, required);
  return missing.map((angle) => `Missing ${ANGLE_LABEL[angle] ?? angle} photo (old app)`);
}

/**
 * The sweep used to record a check older than 24h as sent and skip Slack.
 * That disagreed with markSent, which posted the same check whenever the phone
 * finished uploading, so #radcabcr still got 4-day-late posts with no label.
 * A finished check now posts at any age the sweep still looks at. The Slack
 * text labels it when the post is more than 15 minutes after the driver signed.
 */

/** Specific reason for an unsent check, or undefined when it is not stuck. */
export function stuckReason(
  report: Pick<
    CheckoutReport,
    "idempotencyKey" | "createdAt" | "photos" | "inspectionForm" | "sentAt" | "archivedAt"
  >,
  steps: PhotoStep[] | undefined,
  now = Date.now()
): string | undefined {
  if (report.sentAt || report.archivedAt) return undefined;
  const created = Date.parse(report.createdAt);
  if (!Number.isFinite(created) || created < Date.parse(HISTORICAL_SENT_BEFORE)) return undefined;
  if (now - created < STUCK_UPLOAD_AFTER_MS) return undefined;
  const legacy = isLegacyClientReport(report);
  const missing = steps ? missingRequiredPhotos(report, photoStepsForClient(report, steps)) : [];
  if (missing.length > 0) {
    const n = missing.length;
    return legacy
      ? `Old app · ${n} photo${n === 1 ? "" : "s"} never uploaded`
      : `Missing ${n} photo${n === 1 ? "" : "s"}`;
  }
  return legacy ? "Old app · never sent" : steps ? "Photos in · not sent yet" : undefined;
}
