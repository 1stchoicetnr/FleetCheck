import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  acceptLink,
  assertCanRemoveUser,
  carryOverMemberships,
  checkPassword,
  issueLink,
  previewLink,
  AuthError,
} from "./server/auth-accounts.ts";
import { revokeInvite } from "./server/auth-store.ts";
import { listPeople, type OrgDb } from "./server/org-data.ts";
import { membershipRoleForLegacy } from "./server/member-role.ts";
import { hashPassword, verifyPassword } from "./server/password.ts";
import { loginLocked, recordLoginFail, resetLoginLimits } from "./server/login-limit.ts";

const ORG = "org-1st-choice-rad-cab";

const SCHEMA = `
  CREATE TABLE app_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    org_id TEXT NOT NULL,
    password_hash TEXT
  );
  CREATE TABLE org_memberships (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (org_id, user_id)
  );
  CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE auth_invites (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    user_id TEXT,
    email TEXT,
    name TEXT,
    role TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
  );
`;

function runner(db: PGlite): OrgDb {
  return {
    async query(text, params) {
      const result = await db.query(text, params);
      return result.rows as Record<string, unknown>[];
    },
  };
}

async function seedUsers(db: PGlite) {
  await db.exec(SCHEMA);
  await db.query(
    `INSERT INTO app_users (id, name, email, role, active, created_at, org_id)
     VALUES
      ('user-ashley', 'Ashley', 'ashley@fleetcheck.local', 'super_admin', true, NOW(), $1),
      ('user-office', 'Office', 'ashley@warecovery.com', 'super_admin', true, NOW(), $1),
      ('user-driver', 'Driver', 'driver@fleetcheck.local', 'driver', true, NOW(), $1)`,
    [ORG]
  );
}

test("password hashes verify and reject a wrong password", async () => {
  const stored = await hashPassword("correct-horse");
  assert.match(stored, /^scrypt\$/);
  assert.equal(await verifyPassword("correct-horse", stored), true);
  assert.equal(await verifyPassword("wrong-horse", stored), false);
  assert.equal(await verifyPassword("correct-horse", "nope"), false);
});

test("carry-over roles follow the person's name", () => {
  assert.equal(membershipRoleForLegacy("Ashley", "super_admin"), "owner");
  assert.equal(membershipRoleForLegacy("James", "super_admin"), "owner");
  assert.equal(membershipRoleForLegacy("Office", "super_admin"), "office");
  assert.equal(membershipRoleForLegacy("Tech", "tech"), "office");
  assert.equal(membershipRoleForLegacy("Driver", "driver"), "driver");
  assert.equal(membershipRoleForLegacy("Someone", "super_admin"), "owner");
});

test("login lockout trips after five failures and clears", () => {
  resetLoginLimits();
  const now = Date.now();
  for (let i = 0; i < 5; i += 1) recordLoginFail("203.0.113.5", now);
  assert.equal(loginLocked("203.0.113.5", now), true);
  assert.equal(loginLocked("203.0.113.6", now), false);
  assert.equal(loginLocked("203.0.113.5", now + 16 * 60 * 1000), false);
  resetLoginLimits();
});

test("carry-over adds memberships without rewriting the user row", async () => {
  const pg = new PGlite();
  await seedUsers(pg);
  const db = runner(pg);
  const before = await db.query("SELECT id, name, email, role FROM app_users ORDER BY id");
  await carryOverMemberships(db, ORG, [
    { id: "user-ashley", name: "Ashley", role: "super_admin" },
    { id: "user-office", name: "Office", role: "super_admin" },
    { id: "user-driver", name: "Driver", role: "driver" },
  ]);
  await carryOverMemberships(db, ORG, [
    { id: "user-office", name: "Office", role: "driver" },
  ]);
  const after = await db.query("SELECT id, name, email, role FROM app_users ORDER BY id");
  assert.deepEqual(after, before);
  const roles = await db.query(
    "SELECT user_id, role FROM org_memberships ORDER BY user_id"
  );
  assert.deepEqual(roles, [
    { user_id: "user-ashley", role: "owner" },
    { user_id: "user-driver", role: "driver" },
    { user_id: "user-office", role: "office" },
  ]);
  await pg.close();
});

test("setup link sets a password once and leaves the account columns alone", async () => {
  const pg = new PGlite();
  await seedUsers(pg);
  const db = runner(pg);
  await carryOverMemberships(db, ORG, [
    { id: "user-ashley", name: "Ashley", role: "super_admin" },
  ]);
  const first = await issueLink(db, {
    orgId: ORG,
    kind: "setup",
    role: "owner",
    userId: "user-ashley",
    email: "ashley@fleetcheck.local",
    name: "Ashley",
  });
  const replacement = await issueLink(db, {
    orgId: ORG,
    kind: "setup",
    role: "owner",
    userId: "user-ashley",
    email: "ashley@fleetcheck.local",
    name: "Ashley",
  });
  assert.equal(await previewLink(db, first.token), null);
  await assert.rejects(
    () => acceptLink(db, replacement.token, "short"),
    (err: unknown) => err instanceof AuthError && err.status === 400
  );
  const stillOpen = await previewLink(db, replacement.token);
  assert.equal(stillOpen?.email, "ashley@fleetcheck.local");
  const user = await acceptLink(db, replacement.token, "long-enough-password");
  assert.equal(user.email, "ashley@fleetcheck.local");
  assert.equal(user.role, "owner");
  await assert.rejects(() => acceptLink(db, replacement.token, "long-enough-password"));
  const row = await db.query(
    "SELECT name, email, role, password_hash FROM app_users WHERE id = 'user-ashley'"
  );
  assert.equal(row[0].name, "Ashley");
  assert.equal(row[0].email, "ashley@fleetcheck.local");
  assert.equal(row[0].role, "super_admin");
  assert.equal(typeof row[0].password_hash, "string");
  const signedIn = await checkPassword(db, ORG, "Ashley@Fleetcheck.local", "long-enough-password");
  assert.equal(signedIn?.id, "user-ashley");
  assert.equal(signedIn?.role, "owner");
  assert.equal(await checkPassword(db, ORG, "missing@example.com", "long-enough-password"), null);
  const people = await listPeople(db, ORG);
  const ashley = people.find((person) => person.id === "user-ashley");
  assert.equal(ashley?.has_password, true);
  assert.equal("password_hash" in (ashley || {}), false);
  await pg.close();
});

test("invites are single-use, expiring, and revocable", async () => {
  const pg = new PGlite();
  await seedUsers(pg);
  const db = runner(pg);
  const invite = await issueLink(db, {
    orgId: ORG,
    kind: "invite",
    role: "driver",
    email: "new.driver@example.com",
    name: "New Driver",
  });
  await assert.rejects(
    () => acceptLink(db, invite.token, "short"),
    (err: unknown) => err instanceof AuthError && err.status === 400
  );
  const created = await acceptLink(db, invite.token, "driver-password");
  assert.equal(created.email, "new.driver@example.com");
  assert.equal(created.role, "driver");
  await assert.rejects(
    () => acceptLink(db, invite.token, "driver-password"),
    (err: unknown) => err instanceof AuthError && err.status === 404
  );
  const row = await db.query("SELECT role FROM app_users WHERE id = $1", [created.id]);
  assert.equal(row[0].role, "driver");

  const expired = await issueLink(db, {
    orgId: ORG,
    kind: "invite",
    role: "office",
    email: "late@example.com",
    name: "Late",
  });
  await db.query("UPDATE auth_invites SET expires_at = $1 WHERE id = $2", [
    new Date(Date.now() - 60_000).toISOString(),
    expired.id,
  ]);
  assert.equal(await previewLink(db, expired.token), null);
  await assert.rejects(() => acceptLink(db, expired.token, "long-enough-password"));

  const revoked = await issueLink(db, {
    orgId: ORG,
    kind: "invite",
    role: "driver",
    email: "gone@example.com",
    name: "Gone",
  });
  assert.equal(await revokeInvite(db, ORG, revoked.id), true);
  assert.equal(await previewLink(db, revoked.token), null);
  await assert.rejects(() => acceptLink(db, revoked.token, "long-enough-password"));

  const taken = await issueLink(db, {
    orgId: ORG,
    kind: "invite",
    role: "driver",
    email: "ashley@fleetcheck.local",
    name: "Ashley",
  });
  await assert.rejects(
    () => acceptLink(db, taken.token, "long-enough-password"),
    (err: unknown) => err instanceof AuthError && err.status === 409
  );
  assert.throws(() => assertCanRemoveUser("user-ashley"), AuthError);
  await pg.close();
});
