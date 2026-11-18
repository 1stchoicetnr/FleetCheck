/** Damage alerts wait this long for photos before going out anyway. */
export const ALERT_PHOTO_WAIT_MS = 30 * 60 * 1000;

/**
 * Damage alerts (office queue + #rad-cab-repairs) go out once the check's
 * required photos have landed, once it is sent (with or without photos), or
 * after 30 minutes, whichever comes first. Before, they fired on create, before
 * any photo, so the alert opened a check with nothing to look at.
 */
export function alertsReady(input: {
  missingPhotos: number;
  sentAt?: string | null;
  createdAt: string;
  now?: number;
}): boolean {
  if (input.missingPhotos <= 0 || input.sentAt) return true;
  const created = Date.parse(input.createdAt);
  if (!Number.isFinite(created)) return true;
  return (input.now ?? Date.now()) - created >= ALERT_PHOTO_WAIT_MS;
}
