import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { AuthError } from "./server/auth-accounts.ts";
import { insertSession } from "./server/auth-store.ts";
import { applyManagerRoleMigration, listUserFleetIds, type OrgDb } from "./server/org-data.ts";
import { updatePersonAccess } from "./server/people-admin.ts";

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
    password_hash TEXT,
    access_status TEXT NOT NULL DEFAULT 'active'
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
  CREATE TABLE fleets (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE user_fleets (
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    fleet_id TEXT NOT NULL,
    PRIMARY KEY (org_id, user_id, fleet_id)
  );
  CREATE TABLE auth_invites (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    kind TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE fleet_settings (
    id TEXT PRIMARY KEY,
    allow_driver_add_vehicles BOOLEAN NOT NULL DEFAULT FALSE,
    org_id TEXT NOT NULL
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

async function seed(db: PGlite) {
  await db.exec(SCHEMA);
  await db.query(
    `INSERT INTO fleet_settings (id, allow_driver_add_vehicles, org_id) VALUES ('app', false, $1)`,
    [ORG]
  );
  await db.query(
    `INSERT INTO fleets (id, org_id, company_id, name, type, created_at) VALUES
      ('fleet-rad-cab', $1, 'company-rad-cab', 'Rad Cab', 'taxi', NOW()),
      ('fleet-turo', $1, 'company-turo', 'Turo', 'turo', NOW())`,
    [ORG]
  );
  const people = [
    ["user-owner", "Ashley", "ashley@example.com", "super_admin", "owner"],
    ["user-office", "Office", "office@example.com", "management", "office"],
    ["user-driver", "Driver", "driver@example.com", "driver", "driver"],
  ] as const;
  for (const [id, name, email, legacy, role] of people) {
    await db.query(
      `INSERT INTO app_users (id, name, email, role, active, created_at, org_id)
       VALUES ($1, $2, $3, $4, true, NOW(), $5)`,
      [id, name, email, legacy, ORG]
    );
    await db.query(
      `INSERT INTO org_memberships (id, org_id, user_id, role, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [`member-${id}`, ORG, id, role]
    );
  }
  await db.query(
    `INSERT INTO user_fleets (org_id, user_id, fleet_id) VALUES
      ($1, 'user-office', 'fleet-rad-cab'),
      ($1, 'user-driver', 'fleet-rad-cab')`,
    [ORG]
  );
}

test("manager role migration leaves Office as Office and is a no-op the second time", async () => {
  const db = new PGlite();
  await seed(db);
  const org = runner(db);
  const first = await applyManagerRoleMigration(org, ORG, "2026-10-22T00:00:00.000Z");
  assert.equal(first.alreadyApplied, false);
  assert.equal(first.officeCount, 1);
  const role = await db.query(`SELECT role FROM org_memberships WHERE user_id = 'user-office'`);
  assert.equal(role.rows[0]?.role, "office");
  const second = await applyManagerRoleMigration(org, ORG, "2026-10-23T00:00:00.000Z");
  assert.equal(second.alreadyApplied, true);
  const still = await db.query(`SELECT role FROM org_memberships WHERE user_id = 'user-office'`);
  assert.equal(still.rows[0]?.role, "office");
  const marker = await db.query(`SELECT manager_role_at FROM fleet_settings WHERE org_id = $1`, [ORG]);
  assert.equal(new Date(String(marker.rows[0]?.manager_role_at)).toISOString(), "2026-10-22T00:00:00.000Z");
});

test("a manager can change Office inside their fleets and cannot touch owners or other fleets", async () => {
  const db = new PGlite();
  await seed(db);
  const org = runner(db);
  await assert.rejects(
    () =>
      updatePersonAccess(org, {
        orgId: ORG,
        userId: "user-owner",
        actorRole: "manager",
        actorFleetIds: ["fleet-rad-cab"],
        role: "office",
      }),
    (err: unknown) => err instanceof AuthError && /Owners are outside/.test(err.message)
  );
  await assert.rejects(
    () =>
      updatePersonAccess(org, {
        orgId: ORG,
        userId: "user-office",
        actorRole: "manager",
        actorFleetIds: ["fleet-rad-cab"],
        fleetIds: ["fleet-turo"],
      }),
    (err: unknown) => err instanceof AuthError && /inside your own fleets/.test(err.message)
  );
  await updatePersonAccess(org, {
    orgId: ORG,
    userId: "user-office",
    actorRole: "manager",
    actorFleetIds: ["fleet-rad-cab"],
    role: "manager",
    fleetIds: ["fleet-rad-cab"],
  });
  const membership = await db.query(
    `SELECT role FROM org_memberships WHERE user_id = 'user-office'`
  );
  assert.equal(membership.rows[0]?.role, "manager");
  const legacy = await db.query(`SELECT role FROM app_users WHERE id = 'user-office'`);
  assert.equal(legacy.rows[0]?.role, "management");
  assert.deepEqual(await listUserFleetIds(org, ORG, "user-office"), ["fleet-rad-cab"]);
});

test("deactivating a person ends their sessions", async () => {
  const db = new PGlite();
  await seed(db);
  const org = runner(db);
  await insertSession(org, {
    token_hash: "hash-driver",
    user_id: "user-driver",
    org_id: ORG,
    role: "driver",
    expires_at: "2099-01-01T00:00:00.000Z",
    created_at: "2026-10-22T00:00:00.000Z",
  });
  await updatePersonAccess(org, {
    orgId: ORG,
    userId: "user-driver",
    actorRole: "manager",
    actorFleetIds: ["fleet-rad-cab"],
    active: false,
  });
  const sessions = await db.query(`SELECT token_hash FROM auth_sessions WHERE user_id = 'user-driver'`);
  assert.equal(sessions.rows.length, 0);
  const user = await db.query(`SELECT active FROM app_users WHERE id = 'user-driver'`);
  assert.equal(user.rows[0]?.active, false);
});
