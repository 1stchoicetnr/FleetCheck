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
