import { getUser } from "./org-data";
import { orgFromSession } from "./org-scope";
import { assertOfficePin, isOfficeRequest } from "./office-pin";
import { AuthError } from "./auth-accounts";
import { getSession } from "./auth-store";
import { hashSecret, SESSION_COOKIE } from "./auth-tokens";
import { isMemberRole, type MemberRole } from "./member-role";
import { pgDb, pgMigrateAndSeed } from "./postgres-store";

export type RequestAuth = {
  orgId: string;
  userId: string | null;
  role: MemberRole | null;
  source: "session" | "open" | "pin";
  name?: string;
  email?: string;
};

function cookieValue(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function openAuth(): RequestAuth {
  return {
    orgId: orgFromSession(),
    userId: null,
    role: null,
    source: "open",
  };
}

/** Read the session cookie. A missing or expired cookie leaves the request open (demo and PIN still work). */
export async function resolveRequestAuth(req: Request): Promise<RequestAuth> {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return openAuth();
  await pgMigrateAndSeed();
  const db = pgDb();
  const session = await getSession(db, hashSecret(token));
  if (!session || !isMemberRole(session.role)) return openAuth();
  const user = await getUser(db, session.org_id, session.user_id);
  if (!user || user.active === false) return openAuth();
  return {
    orgId: session.org_id,
    userId: session.user_id,
    role: session.role,
    source: "session",
    name: String(user.name),
    email: String(user.email),
  };
}

export async function orgIdFromRequest(req: Request): Promise<string> {
  return (await resolveRequestAuth(req)).orgId;
}

export async function openAuthDb() {
  await pgMigrateAndSeed();
  return pgDb();
}

export function sessionGrantsOffice(auth: RequestAuth): boolean {
  return auth.role === "office" || auth.role === "owner";
}

/** Office or owner session, or the existing office PIN during this transition. */
export async function assertOfficeAccess(req: Request): Promise<RequestAuth> {
  const auth = await resolveRequestAuth(req);
  if (sessionGrantsOffice(auth)) return auth;
  await assertOfficePin(req);
  return { ...auth, role: "office", source: "pin" };
}

/**
 * Owner session, or the office PIN until Ashley turns the PIN off.
 * The PIN does not hide the demo role buttons.
 */
export async function assertOwnerAccess(req: Request): Promise<RequestAuth> {
  const auth = await resolveRequestAuth(req);
  if (auth.role === "owner") return auth;
  if (await isOfficeRequest(req)) return { ...auth, role: "owner", source: "pin" };
  throw new AuthError("Owner access is required.", 401);
}
