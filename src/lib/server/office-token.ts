/** Edge- and Node-safe helpers for the office session cookie (Web Crypto only). */
export const OFFICE_COOKIE = "fc_office";
export const OFFICE_COOKIE_MAX_AGE = 60 * 60 * 12; // 12h

export function configuredOfficePin(): string {
  return (process.env.OFFICE_PIN || "").trim();
}

async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cookie value = `${expiresAtMs}.${hmac(OFFICE_PIN, expiresAtMs)}`. Changing OFFICE_PIN revokes all sessions. */
export async function createOfficeToken(): Promise<string | null> {
  const pin = configuredOfficePin();
  if (!pin) return null;
  const exp = Date.now() + OFFICE_COOKIE_MAX_AGE * 1000;
  return `${exp}.${await hmacHex(pin, `fleetcheck-office:${exp}`)}`;
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyOfficeToken(token: string | undefined | null): Promise<boolean> {
  const pin = configuredOfficePin();
  if (!pin || !token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(sig, await hmacHex(pin, `fleetcheck-office:${exp}`));
}
