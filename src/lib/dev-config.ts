function isLocalDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Photo shortcuts stay on a local dev server. A public flag cannot skip them in production. */
export function canSkipPhotosForTesting(): boolean {
  return isLocalDevelopment();
}

export function shouldAutoSkipPhotos(): boolean {
  return isLocalDevelopment() && process.env.NEXT_PUBLIC_SKIP_PHOTOS === "true";
}
