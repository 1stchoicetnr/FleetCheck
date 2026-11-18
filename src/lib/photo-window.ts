/** Drivers can add photos to their own check for this long after it was created. */
export const DRIVER_UPLOAD_WINDOW_MS = 6 * 60 * 60 * 1000;

export const PHOTO_WINDOW_CLOSED_MESSAGE =
  "This checkout is closed for new photos. Ask the office.";

/** True once a driver may no longer add photos. A bad date counts as closed. */
export function driverPhotoWindowClosed(createdAt: string | undefined, now = Date.now()): boolean {
  const created = Date.parse(createdAt ?? "");
  return !Number.isFinite(created) || now - created > DRIVER_UPLOAD_WINDOW_MS;
}

export function isPhotoWindowClosedError(message: string | undefined): boolean {
  return /closed for new photos/i.test(message ?? "");
}

/** Photos taken this long after the check reached the server still count as part of it. */
export const QUEUED_PHOTO_GRACE_MS = 15 * 60 * 1000;

/**
 * A driver may add photos inside the 6-hour window. After it, photos still go
 * on an unsent check when they were taken before the check reached the server
 * (plus a short grace): the phone held them while it had no signal, and
 * refusing them threw them away. New photos on an old check are still refused.
 */
export function driverMayAddPhotos(
  report: { createdAt?: string; sentAt?: string | null },
  capturedAts: Array<string | undefined>,
  now = Date.now()
): boolean {
  if (!driverPhotoWindowClosed(report.createdAt, now)) return true;
  if (report.sentAt) return false;
  const created = Date.parse(report.createdAt ?? "");
  if (!Number.isFinite(created) || capturedAts.length === 0) return false;
  return capturedAts.every((value) => {
    const t = Date.parse(value ?? "");
    return Number.isFinite(t) && t <= created + QUEUED_PHOTO_GRACE_MS;
  });
}
