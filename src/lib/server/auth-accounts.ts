import { randomBytes } from "crypto";
import {
  claimInvite,
  deleteUserSessions,
  getInviteByHash,
  insertInvite,
  insertSession,
  memberRoleForUser,
  revokeOpenSetupLinks,
  type InviteRow,
} from "./auth-store";
import { hashSecret, INVITE_TTL_MS, newSecret, SESSION_MAX_AGE_SEC } from "./auth-tokens";
import {
  CARRY_OVER_USER_IDS,
  isMemberRole,
  legacyRoleForMember,
  memberRoleTitle,
  type MemberRole,
} from "./member-role";
import {
  deleteMemberUser,
  ensureMembership,
  findUserByEmail,
  getUser,
  insertMemberUser,
  replaceUserFleets,
  type OrgDb,
  setUserPassword,
} from "./org-data";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

function inviteOpen(invite: InviteRow, now = Date.now()): boolean {
  if (invite.used_at || invite.revoked_at) return false;
  return new Date(invite.expires_at).getTime() > now;
}

export type SignInResult =
  | { kind: "ok"; user: { id: string; name: string; email: string; role: MemberRole } }
  | { kind: "pending" }
  | { kind: "denied" }
  | { kind: "invalid" };

export async function classifySignIn(
  db: OrgDb,
  orgId: string,
  email: string,
  password: string
): Promise<SignInResult> {
  const row = await findUserByEmail(db, orgId, email);
  const stored =
    row && typeof row.password_hash === "string" && row.password_hash
      ? row.password_hash
      : await dummyPasswordHash();
  const match = await verifyPassword(password, stored);
  if (!row || typeof row.password_hash !== "string" || !row.password_hash || !match) {
    return { kind: "invalid" };
  }
  const status = String(row.access_status || "");
  if (status === "pending") return { kind: "pending" };
  if (status === "denied") return { kind: "denied" };
  if (row.active === false) return { kind: "invalid" };
  const role = (await memberRoleForUser(db, orgId, String(row.id))) || "";
  if (!isMemberRole(role)) return { kind: "invalid" };
  return {
    kind: "ok",
    user: {
      id: String(row.id),
      name: String(row.name),
      email: String(row.email),
      role,
    },
  };
}

export async function checkPassword(
  db: OrgDb,
  orgId: string,
  email: string,
  password: string
): Promise<{ id: string; name: string; email: string; role: MemberRole } | null> {
  const result = await classifySignIn(db, orgId, email, password);
  return result.kind === "ok" ? result.user : null;
}

export async function openSession(
  db: OrgDb,
  user: { id: string; orgId: string; role: MemberRole }
): Promise<string> {
  const token = newSecret();
  const now = new Date();
  await insertSession(db, {
    token_hash: hashSecret(token),
    user_id: user.id,
    org_id: user.orgId,
    role: user.role,
    expires_at: new Date(now.getTime() + SESSION_MAX_AGE_SEC * 1000).toISOString(),
    created_at: now.toISOString(),
  });
  return token;
}

export function publicProfile(user: {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: legacyRoleForMember(user.role),
    roleTitle: memberRoleTitle(user.role),
    fleetIds: [] as string[],
    companyIds: [] as string[],
  };
}

export async function issueLink(
  db: OrgDb,
  input: {
    orgId: string;
    kind: "setup" | "invite";
    role: MemberRole;
    userId?: string | null;
    email?: string | null;
    name?: string | null;
    fleetIds?: string[];
  }
): Promise<{ token: string; expiresAt: string; id: string }> {
  if (input.kind === "setup" && input.userId) {
    await revokeOpenSetupLinks(db, input.orgId, input.userId);
  }
  const token = newSecret();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();
  const id = randomBytes(12).toString("base64url");
  await insertInvite(db, {
    id,
    org_id: input.orgId,
    token_hash: hashSecret(token),
    kind: input.kind,
    user_id: input.userId ?? null,
    email: input.email ?? null,
    name: input.name ?? null,
    role: input.role,
    fleet_ids: input.fleetIds && input.fleetIds.length ? input.fleetIds.join(",") : null,
    expires_at: expiresAt,
    revoked_at: null,
    used_at: null,
    created_at: now.toISOString(),
  });
  return { token, expiresAt, id };
}

export async function previewLink(db: OrgDb, token: string) {
  const invite = await getInviteByHash(db, hashSecret(token));
  if (!invite || !inviteOpen(invite) || !isMemberRole(invite.role)) return null;
  return {
    kind: invite.kind,
    name: invite.name,
    email: invite.email,
    roleTitle: memberRoleTitle(invite.role),
  };
}

export async function acceptLink(
  db: OrgDb,
  token: string,
  password: string
): Promise<{ id: string; name: string; email: string; role: MemberRole; orgId: string }> {
  if (password.length < 8 || password.length > 200) {
    throw new AuthError("Use at least 8 characters.", 400);
  }
  const invite = await getInviteByHash(db, hashSecret(token));
  if (!invite || !inviteOpen(invite) || !isMemberRole(invite.role)) {
    throw new AuthError("This link has expired or was already used.", 404);
  }

  let existing: Record<string, unknown> | undefined;
  if (invite.kind === "setup") {
    if (!invite.user_id) throw new AuthError("This link has expired or was already used.", 404);
    existing = await getUser(db, invite.org_id, invite.user_id);
    if (!existing) throw new AuthError("This link has expired or was already used.", 404);
  } else {
    const email = (invite.email || "").trim().toLowerCase();
    const name = (invite.name || "").trim();
    if (!email || !name) throw new AuthError("This link has expired or was already used.", 404);
    const taken = await findUserByEmail(db, invite.org_id, email);
    if (taken) {
      throw new AuthError("That email already has an account. Ask for a setup link.", 409);
    }
  }

  const passwordHash = await hashPassword(password);
  const claimed = await claimInvite(db, invite.org_id, invite.id);
  if (!claimed) throw new AuthError("This link has expired or was already used.", 404);

  if (invite.kind === "setup" && existing && invite.user_id) {
    await setUserPassword(db, invite.org_id, invite.user_id, passwordHash);
    await deleteUserSessions(db, invite.org_id, invite.user_id);
    return {
      id: String(existing.id),
      name: String(existing.name),
      email: String(existing.email),
      role: invite.role,
      orgId: invite.org_id,
    };
  }

  const email = (invite.email || "").trim().toLowerCase();
  const name = (invite.name || "").trim();
  const id = randomBytes(12).toString("base64url");
  const createdAt = new Date().toISOString();
  try {
    await insertMemberUser(db, invite.org_id, {
      id,
      name,
      email,
      role: legacyRoleForMember(invite.role),
      active: true,
      createdAt,
      passwordHash,
      membershipId: `member-${id}`,
      memberRole: invite.role,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(message)) {
      throw new AuthError("That email already has an account. Ask for a setup link.", 409);
    }
    throw err;
  }
  const fleetIds = String(invite.fleet_ids || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (fleetIds.length) await replaceUserFleets(db, invite.org_id, id, fleetIds);
  return { id, name, email, role: invite.role, orgId: invite.org_id };
}

export async function carryOverMemberships(
  db: OrgDb,
  orgId: string,
  users: Array<{ id: string; name: string; role: string }>
): Promise<void> {
  const { membershipRoleForLegacy } = await import("./member-role");
  const createdAt = new Date().toISOString();
  for (const user of users) {
    await ensureMembership(db, orgId, {
      id: `member-${user.id}`,
      userId: user.id,
      role: membershipRoleForLegacy(user.name, user.role),
      createdAt,
    });
  }
}

export function assertCanRemoveUser(userId: string) {
  if (CARRY_OVER_USER_IDS.has(userId)) {
    throw new AuthError("This person is part of the company and stays on the account.", 403);
  }
}

export async function removeThrowawayUser(
  db: OrgDb,
  orgId: string,
  userId: string,
  email?: string
) {
  await deleteUserSessions(db, orgId, userId);
  await db.query(
    `DELETE FROM auth_invites
     WHERE org_id = $1 AND (user_id = $2 OR lower(COALESCE(email, '')) = lower($3))`,
    [orgId, userId, email ?? ""]
  );
  return deleteMemberUser(db, orgId, userId);
}
