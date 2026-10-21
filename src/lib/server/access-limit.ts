const MAX_REQUESTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Bucket = { count: number; first: number };
const hits = new Map<string, Bucket>();

export function accessRequestLimited(ip: string, now = Date.now()): boolean {
  const entry = hits.get(ip);
  if (!entry) return false;
  if (now - entry.first > WINDOW_MS) {
    hits.delete(ip);
    return false;
  }
  return entry.count >= MAX_REQUESTS;
}

export function recordAccessRequest(ip: string, now = Date.now()): void {
  const entry = hits.get(ip);
  if (!entry || now - entry.first > WINDOW_MS) {
    hits.set(ip, { count: 1, first: now });
  } else {
    entry.count += 1;
  }
  if (hits.size > 5000) hits.clear();
}

export function resetAccessLimits(): void {
  hits.clear();
}
