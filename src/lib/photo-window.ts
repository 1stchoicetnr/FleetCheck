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
