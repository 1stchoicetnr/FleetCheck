const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type Bucket = { count: number; first: number };
const fails = new Map<string, Bucket>();

export function loginLocked(ip: string, now = Date.now()): boolean {
  const entry = fails.get(ip);
  if (!entry) return false;
  if (now - entry.first > WINDOW_MS) {
    fails.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

export function recordLoginFail(ip: string, now = Date.now()): void {
  const entry = fails.get(ip);
  if (!entry || now - entry.first > WINDOW_MS) {
    fails.set(ip, { count: 1, first: now });
  } else {
    entry.count += 1;
  }
  if (fails.size > 5000) fails.clear();
}

export function clearLoginFails(ip: string): void {
  fails.delete(ip);
}

export function resetLoginLimits(): void {
  fails.clear();
}
