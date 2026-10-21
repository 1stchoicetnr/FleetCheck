import {
  configuredOfficePin,
  OFFICE_COOKIE,
  safeEqual,
  verifyOfficeToken,
} from "./office-token";

async function defaultPinFallback(): Promise<boolean> {
  const { pinFallbackOpen } = await import("./pin-fallback");
  return pinFallbackOpen();
}

let pinFallbackCheck: () => Promise<boolean> = defaultPinFallback;

export function setPinFallbackCheck(check: () => Promise<boolean>) {
  pinFallbackCheck = check;
}

export function resetPinFallbackCheck() {
  pinFallbackCheck = defaultPinFallback;
}

export async function officePinEnabled(): Promise<boolean> {
  try {
    return await pinFallbackCheck();
  } catch (err) {
    console.error("[pin-fallback]", err);
    return true;
  }
}

export class OfficeAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/* ---------- wrong-guess limiter (per IP, per server instance) ---------- */
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, { count: number; first: number }>();

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function lockedOut(ip: string): boolean {
  const e = fails.get(ip);
  if (!e) return false;
  if (Date.now() - e.first > WINDOW_MS) {
    fails.delete(ip);
    return false;
  }
  return e.count >= MAX_FAILS;
}

function recordFail(ip: string) {
  const e = fails.get(ip);
  if (!e || Date.now() - e.first > WINDOW_MS) fails.set(ip, { count: 1, first: Date.now() });
  else e.count += 1;
  if (fails.size > 5000) fails.clear();
}

/** Check a submitted PIN, with lockout. Fails closed when OFFICE_PIN is unset. */
export function checkOfficePinGuarded(req: Request, pin: string): void {
  const expected = configuredOfficePin();
  if (!expected) throw new OfficeAuthError("Office access is not configured", 503);
  const ip = clientIp(req);
  if (lockedOut(ip)) throw new OfficeAuthError("Too many wrong PIN attempts. Try again in 15 minutes.", 429);
  const submitted = pin.trim();
  // Missing PIN is unauthorized, but it is not a wrong guess. Office pages
  // must not burn the lockout by loading data before unlock.
  if (!submitted) throw new OfficeAuthError("Invalid office PIN", 401);
  if (!safeEqual(submitted, expected)) {
    recordFail(ip);
    throw new OfficeAuthError("Invalid office PIN", 401);
  }
  fails.delete(ip);
}

function cookieValue(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function pinFromRequest(req: Request): string {
  return (req.headers.get("x-office-pin") || "").trim();
}

/** True if the request carries a valid office session cookie or PIN header. Never throws. */
export async function isOfficeRequest(req: Request): Promise<boolean> {
  if (!(await officePinEnabled())) return false;
  if (!configuredOfficePin()) return false;
  if (await verifyOfficeToken(cookieValue(req, OFFICE_COOKIE))) return true;
  const pin = pinFromRequest(req);
  if (!pin) return false;
  try {
    checkOfficePinGuarded(req, pin);
    return true;
  } catch {
    return false;
  }
}

/** Throws OfficeAuthError (401/429/503) unless the request is from the office. */
export async function assertOfficePin(req: Request): Promise<void> {
  if (!(await officePinEnabled())) {
    throw new OfficeAuthError("Sign in with your email. The office PIN is off.", 403);
  }
  if (!configuredOfficePin()) throw new OfficeAuthError("Office access is not configured", 503);
  if (await verifyOfficeToken(cookieValue(req, OFFICE_COOKIE))) return;
  checkOfficePinGuarded(req, pinFromRequest(req));
}
