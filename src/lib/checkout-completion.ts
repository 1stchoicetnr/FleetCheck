import { canSkipPhotosForTesting } from "./dev-config";
import { isPrecheckRed } from "./inspection-form";
import type { CheckoutReport, PhotoAngle, PhotoStep } from "./types";

/** Required angles that are not stored yet. A red precheck and local dev skip need none. */
export function missingRequiredPhotos(
  report: Pick<CheckoutReport, "photos" | "inspectionForm">,
  steps: PhotoStep[]
): PhotoAngle[] {
  if (canSkipPhotosForTesting()) return [];
  if (isPrecheckRed(report.inspectionForm)) return [];
  const stored = new Set(
    report.photos.filter((photo) => Boolean(photo.dataUrl?.trim())).map((photo) => photo.angle)
  );
  return steps.filter((step) => step.required && !stored.has(step.angle)).map((step) => step.angle);
}

/** Drivers cannot be marked sent while a required photo is missing. Office can record sent anyway. */
export function sentBlockedByMissingPhotos(office: boolean, missingCount: number): boolean {
  return !office && missingCount > 0;
}

/** Slack already has this checkout. Recording sent time must not post it again. */
export function slackAlreadyHasCheckout(status: string | null | undefined): boolean {
  return status === "sent";
}

/** A finished check stays finished. A new check stays uploading until the required photos are stored. */
export function checkoutCompletionStatus(
  existingStatus: CheckoutReport["status"] | undefined,
  report: Pick<CheckoutReport, "photos" | "inspectionForm">,
  steps: PhotoStep[]
): CheckoutReport["status"] {
  if (existingStatus === "complete") return "complete";
  return missingRequiredPhotos(report, steps).length === 0 ? "complete" : "uploading";
}
