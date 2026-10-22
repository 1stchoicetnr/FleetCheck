import { randomBytes } from "crypto";
import { AuthError } from "./auth-accounts";
import { isMemberRole, legacyRoleForMember, type MemberRole } from "./member-role";
import { canGrantMemberRole, fleetsStayInside } from "../role-access";
import { hashPassword } from "./password";
import {
  approvePendingUser,
  denyPendingUser,
  findUserByEmail,
  getFleet,
  insertPendingUser,
  listPendingUsers,
  replaceUserFleets,
  setMembershipRole,
  type OrgDb,
} from "./org-data";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAccessEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length < 3 || email.length > 200 || !EMAIL_RE.test(email)) {
    throw new AuthError("Enter a valid email.", 400);
  }
  return email;
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 20 || trimmed.length > 40) {
    throw new AuthError("Enter a phone number.", 400);
  }
  return trimmed;
}

export function normalizePersonName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80) throw new AuthError("Enter your name.", 400);
  return name;
}

function existingStatus(row: Record<string, unknown>): "pending" | "denied" | "exists" {
  const status = String(row.access_status || "");
  if (status === "pending") return "pending";
  if (status === "denied") return "denied";
  return "exists";
}

export async function submitAccessRequest(
  db: OrgDb,
  orgId: string,
  input: { name: string; email: string; phone: string; password: string }
): Promise<{ status: "pending" | "denied" | "exists"; created: boolean; name: string; email: string; phone: string }> {
  const name = normalizePersonName(input.name);
  const email = normalizeAccessEmail(input.email);
  const phone = normalizePhone(input.phone);
  if (input.password.length < 8 || input.password.length > 200) {
    throw new AuthError("Use at least 8 characters.", 400);
  }
  const existing = await findUserByEmail(db, orgId, email);
  if (existing) {
    return { status: existingStatus(existing), created: false, name, email, phone };
  }
  const passwordHash = await hashPassword(input.password);
  const id = randomBytes(12).toString("base64url");
  try {
    await insertPendingUser(db, orgId, {
      id,
      name,
      email,
      phone,
      passwordHash,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(message)) {
      const again = await findUserByEmail(db, orgId, email);
      if (again) return { status: existingStatus(again), created: false, name, email, phone };
    }
    throw err;
  }
  return { status: "pending", created: true, name, email, phone };
}

export async function reviewAccessRequest(
  db: OrgDb,
  input: {
    orgId: string;
    userId: string;
    action: "approve" | "deny";
    role?: string;
    fleetIds?: string[];
    actorRole: MemberRole;
    actorFleetIds?: string[] | null;
  }
): Promise<void> {
  if (input.actorRole !== "owner" && input.actorRole !== "manager") {
    throw new AuthError("Manager access is required.", 403);
  }
  if (input.action === "deny") {
    const denied = await denyPendingUser(db, input.orgId, input.userId);
    if (!denied) throw new AuthError("That request is no longer waiting.", 404);
    await replaceUserFleets(db, input.orgId, input.userId, []);
    return;
  }
  if (!isMemberRole(input.role || "")) throw new AuthError("Choose a role.", 400);
  const role = input.role as MemberRole;
  if (!canGrantMemberRole(input.actorRole, role)) {
    throw new AuthError("Only an owner can grant Owner.", 403);
  }
  const fleetIds = [
    ...new Set((input.fleetIds || []).map((id) => id.trim()).filter(Boolean)),
  ];
  if (fleetIds.length < 1 || fleetIds.length > 20) {
    throw new AuthError("Choose at least one fleet.", 400);
  }
  if (
    input.actorRole === "manager" &&
    !fleetsStayInside(input.actorFleetIds ?? [], fleetIds)
  ) {
    throw new AuthError("Choose fleets inside your own fleets.", 403);
  }
  for (const fleetId of fleetIds) {
    const fleet = await getFleet(db, input.orgId, fleetId);
    if (!fleet || fleet.archived_at) {
      throw new AuthError("Choose a fleet in this company.", 400);
    }
  }
  const approved = await approvePendingUser(
    db,
    input.orgId,
    input.userId,
    legacyRoleForMember(role)
  );
  if (!approved) throw new AuthError("That request is no longer waiting.", 404);
  await setMembershipRole(db, input.orgId, {
    id: `member-${input.userId}`,
    userId: input.userId,
    role,
    createdAt: new Date().toISOString(),
  });
  await replaceUserFleets(db, input.orgId, input.userId, fleetIds);
}

export async function pendingAccessRequests(db: OrgDb, orgId: string) {
  const rows = await listPendingUsers(db, orgId);
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : "",
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}
