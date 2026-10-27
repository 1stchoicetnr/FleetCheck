/** Digits only, so "145,900 mi" and "145900" compare the same way. */
export function odometerDigits(value: string | number): string {
  return String(value).replace(/\D/g, "");
}

/**
 * The typed mileage has to appear in the digits read from the photo.
 * Extra trip digits around it are fine. A missing or different digit is not.
 */
export function odometerReadingMatches(
  typed: string | number,
  recognized: string
): boolean {
  const want = odometerDigits(typed);
  const got = odometerDigits(recognized);
  if (want.length < 1 || got.length < 1) return false;
  return got.includes(want);
}

export function odometerMismatchMessage(typed: string | number): string {
  const want = odometerDigits(typed);
  const shown = want
    ? Number(want).toLocaleString("en-US")
    : "the mileage you typed";
  return `The odometer photo does not match ${shown}. Retake a clear photo of that mileage.`;
}

export const ODOMETER_UNREADABLE =
  "Could not read the mileage in this photo. Retake a closer, steady shot of the odometer.";

/** A file older than this was already on the phone. Live camera files are new. */
export const LIBRARY_PHOTO_MAX_AGE_MS = 3 * 60 * 1000;

export const LIBRARY_PHOTO_MESSAGE =
  "Use the live camera. A photo from the library is not accepted.";

export function isLibraryPhoto(lastModified: number, now: number): boolean {
  if (!Number.isFinite(lastModified) || lastModified <= 0) return false;
  return now - lastModified > LIBRARY_PHOTO_MAX_AGE_MS;
}
