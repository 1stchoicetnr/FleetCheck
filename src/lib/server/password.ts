import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 } as const;

function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, SCRYPT_OPTS, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const hash = await scryptAsync(password, salt, 32);
  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const next = await scryptAsync(password, salt, 32);
  const prev = Buffer.from(hash, "base64url");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

let dummyHash: string | null = null;

/** Used when the email is unknown so login takes the same work either way. */
export async function dummyPasswordHash(): Promise<string> {
  dummyHash ??= await hashPassword("not-a-real-password");
  return dummyHash;
}
