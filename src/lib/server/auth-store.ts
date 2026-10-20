import type { OrgDb } from "./org-data";
import type { MemberRole } from "./member-role";

export type SessionRow = {
  token_hash: string;
  user_id: string;
  org_id: string;
  role: MemberRole;
  expires_at: string;
  created_at: string;
};

export type InviteRow = {
  id: string;
  org_id: string;
  token_hash: string;
  kind: "setup" | "invite";
  user_id: string | null;
  email: string | null;
  name: string | null;
  role: MemberRole;
  expires_at: string;
  revoked_at: string | null;
  used_at: string | null;
  created_at: string;
};

export async function insertSession(
  db: OrgDb,
  session: SessionRow
): Promise<void> {
  await db.query(
    `INSERT INTO auth_sessions (token_hash, user_id, org_id, role, expires_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      session.token_hash,
      session.user_id,
      session.org_id,
      session.role,
      session.expires_at,
      session.created_at,
    ]
  );
}

export async function getSession(db: OrgDb, tokenHash: string): Promise<SessionRow | undefined> {
  const rows = await db.query(
    `SELECT token_hash, user_id, org_id, role, expires_at, created_at
     FROM auth_sessions
     WHERE token_hash = $1 AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return undefined;
  return row as unknown as SessionRow;
}

export async function deleteSession(db: OrgDb, tokenHash: string): Promise<void> {
  await db.query("DELETE FROM auth_sessions WHERE token_hash = $1", [tokenHash]);
}

export async function deleteUserSessions(db: OrgDb, orgId: string, userId: string): Promise<void> {
  await db.query(
    "DELETE FROM auth_sessions WHERE org_id = $1 AND user_id = $2",
    [orgId, userId]
  );
}

export async function insertInvite(db: OrgDb, invite: InviteRow): Promise<void> {
  await db.query(
    `INSERT INTO auth_invites (
      id, org_id, token_hash, kind, user_id, email, name, role, expires_at, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      invite.id,
      invite.org_id,
      invite.token_hash,
      invite.kind,
      invite.user_id,
      invite.email,
      invite.name,
      invite.role,
      invite.expires_at,
      invite.created_at,
    ]
  );
}

export async function getInviteByHash(db: OrgDb, tokenHash: string): Promise<InviteRow | undefined> {
  const rows = await db.query(
    `SELECT id, org_id, token_hash, kind, user_id, email, name, role,
            expires_at, revoked_at, used_at, created_at
     FROM auth_invites
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] as unknown as InviteRow | undefined;
}

export async function listInvites(db: OrgDb, orgId: string) {
  return db.query(
    `SELECT id, kind, user_id, email, name, role, expires_at, revoked_at, used_at, created_at
     FROM auth_invites
     WHERE org_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [orgId]
  );
}

export async function revokeInvite(db: OrgDb, orgId: string, id: string): Promise<boolean> {
  const rows = await db.query(
    `UPDATE auth_invites
     SET revoked_at = NOW()
     WHERE id = $1 AND org_id = $2 AND used_at IS NULL AND revoked_at IS NULL
     RETURNING id`,
    [id, orgId]
  );
  return Boolean(rows[0]);
}

export async function revokeOpenSetupLinks(
  db: OrgDb,
  orgId: string,
  userId: string
): Promise<void> {
  await db.query(
    `UPDATE auth_invites
     SET revoked_at = NOW()
     WHERE org_id = $1 AND user_id = $2 AND kind = 'setup'
       AND used_at IS NULL AND revoked_at IS NULL`,
    [orgId, userId]
  );
}

export async function memberRoleForUser(
  db: OrgDb,
  orgId: string,
  userId: string
): Promise<string | undefined> {
  const rows = await db.query(
    `SELECT role FROM org_memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [orgId, userId]
  );
  return rows[0] ? String(rows[0].role) : undefined;
}

export async function claimInvite(db: OrgDb, orgId: string, id: string): Promise<boolean> {
  const rows = await db.query(
    `UPDATE auth_invites
     SET used_at = NOW()
     WHERE id = $1 AND org_id = $2
       AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
     RETURNING id`,
    [id, orgId]
  );
  return Boolean(rows[0]);
}
