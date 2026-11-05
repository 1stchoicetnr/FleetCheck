const GENERIC = new Set([
  "driver",
  "test",
  "user",
  "name",
  "n/a",
  "na",
  "unknown",
  "admin",
  "none",
  "null",
]);

/** True for placeholders such as "Driver" or "Driver 2". A real name is required. */
export function isGenericDriverName(name: string | null | undefined): boolean {
  const normalized = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ");
  if (!normalized) return true;
  if (GENERIC.has(normalized)) return true;
  return /^driver(?:\s+\d+)?$/.test(normalized);
}

export const DRIVER_NAME_MAX = 60;
export const SET_NAME_MESSAGE =
  "Set your real name before you submit a check. Tap Set my name on the checkout page.";

/** Trimmed name the signed-in person may save as their own, or null when it is a placeholder. */
export function cleanOwnName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, DRIVER_NAME_MAX);
  if (trimmed.length < 2 || isGenericDriverName(trimmed)) return null;
  return trimmed;
}
