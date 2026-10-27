const MAX_POSTS = 20;
const WINDOW_MS = 15 * 60 * 1000;

type Bucket = { count: number; first: number };
const posts = new Map<string, Bucket>();

export function alertSlackLimited(key: string, now = Date.now()): boolean {
  const entry = posts.get(key);
  if (!entry) return false;
  if (now - entry.first > WINDOW_MS) {
    posts.delete(key);
    return false;
  }
  return entry.count >= MAX_POSTS;
}

export function recordAlertSlack(key: string, now = Date.now()): void {
  const entry = posts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    posts.set(key, { count: 1, first: now });
  } else {
    entry.count += 1;
  }
  if (posts.size > 5000) posts.clear();
}

export function resetAlertSlackLimits(): void {
  posts.clear();
}
