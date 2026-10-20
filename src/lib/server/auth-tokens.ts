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
