/** Dev/testing helpers — not for production enforcement. */
export function canSkipPhotosForTesting(): boolean {
  return (
    process.env.NEXT_PUBLIC_SKIP_PHOTOS === "true" ||
    process.env.NODE_ENV === "development"
  );
}

export function shouldAutoSkipPhotos(): boolean {
  return process.env.NEXT_PUBLIC_SKIP_PHOTOS === "true";
}
