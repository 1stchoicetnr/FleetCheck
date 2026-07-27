const STORAGE_KEY = "fleetcheck-back-href";

/** Remember where the user came from before entering a nested flow (e.g. check-in workflow). */
export function setReturnHref(href: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, href);
  } catch {
    /* private mode / unavailable */
  }
}

export function getReturnHref(fallback: string): string {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && stored.startsWith("/")) return stored;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function clearReturnHref(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
