import { createHash, randomBytes } from "crypto";

export const SESSION_COOKIE = "fc_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_SEC) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Renew a session once it has less than this left, so drivers are not signed out mid-shift. */
export const SESSION_RENEW_BELOW_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionNeedsRenewal(expiresAt: string | Date | undefined, now = Date.now()): boolean {
  const t = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt ?? ""));
  return Number.isFinite(t) && t > now && t - now < SESSION_RENEW_BELOW_MS;
}
