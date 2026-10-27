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

/** A finished check stays finished. A new check stays uploading until the required photos are stored. */
export function checkoutCompletionStatus(
  existingStatus: CheckoutReport["status"] | undefined,
  report: Pick<CheckoutReport, "photos" | "inspectionForm">,
  steps: PhotoStep[]
): CheckoutReport["status"] {
  if (existingStatus === "complete") return "complete";
  return missingRequiredPhotos(report, steps).length === 0 ? "complete" : "uploading";
}
