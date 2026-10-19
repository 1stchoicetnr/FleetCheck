/**
 * Keep checkout chrome aligned with the physical phone.
 * We never lock landscape and we never enter native fullscreen for capture.
 */

export async function exitLeftoverFullscreen(): Promise<void> {
  try {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) return;
    await document.exitFullscreen?.();
  } catch {
    /* ignore */
  }
}

/** Drop any Screen Orientation lock so the UI follows the device. */
export function unlockScreenOrientation(): void {
  try {
    if (typeof screen === "undefined") return;
    screen.orientation?.unlock?.();
  } catch {
    /* NotAllowedError when this document did not lock — safe to ignore. */
  }
}

export async function restoreNaturalOrientation(): Promise<void> {
  await exitLeftoverFullscreen();
  unlockScreenOrientation();
}
