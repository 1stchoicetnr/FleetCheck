import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyOwnerEmailSwap, findUserByEmail, type OrgDb } from "./server/org-data.ts";

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
    phone TEXT,
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
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE checkout_reports (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    dispatcher_name TEXT NOT NULL,
    reviewed_by TEXT
  );
  CREATE TABLE app_feedback (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_name TEXT,
    driver_name TEXT
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
  await db.exec(`
    INSERT INTO app_users (id, name, email, role, active, created_at, org_id) VALUES
      ('user-ashley', 'Ashley', 'ashley@fleetcheck.local', 'super_admin', true, NOW(), '${ORG}'),
      ('user-james', 'James', 'James@Fleetcheck.local', 'super_admin', true, NOW(), '${ORG}'),
      ('user-office', 'Office', 'Ashley@Warecovery.com', 'super_admin', true, NOW(), '${ORG}'),
      ('user-tech', 'Tech', 'tech@fleetcheck.local', 'tech', true, NOW(), '${ORG}'),
      ('user-driver', 'Driver', 'driver@fleetcheck.local', 'driver', true, NOW(), '${ORG}');
    INSERT INTO org_memberships (id, org_id, user_id, role, created_at) VALUES
      ('member-user-ashley', '${ORG}', 'user-ashley', 'owner', NOW()),
      ('member-user-james', '${ORG}', 'user-james', 'owner', NOW()),
      ('member-user-office', '${ORG}', 'user-office', 'office', NOW());
    INSERT INTO auth_sessions (token_hash, user_id, org_id, role, expires_at, created_at)
      VALUES ('office-session', 'user-office', '${ORG}', 'office', NOW() + INTERVAL '1 day', NOW());
    INSERT INTO auth_invites (id, org_id, token_hash, kind, user_id, email, name, role, expires_at, created_at)
      VALUES
        ('invite-ashley', '${ORG}', 'hash-ashley', 'setup', 'user-ashley', 'ashley@fleetcheck.local', 'Ashley', 'owner', NOW() + INTERVAL '7 days', NOW()),
        ('invite-office', '${ORG}', 'hash-office', 'setup', 'user-office', 'ashley@warecovery.com', 'Office', 'office', NOW() + INTERVAL '7 days', NOW());
    INSERT INTO checkout_reports (id, org_id, driver_name, dispatcher_name, reviewed_by)
      VALUES ('report-1', '${ORG}', 'Amber', 'Ashley', 'Office');
    INSERT INTO app_feedback (id, org_id, user_name, driver_name)
      VALUES ('feedback-1', '${ORG}', 'Office', 'Amber');
  `);
}

test("owner emails swap once and leave reports and feedback text alone", async () => {
  const pg = new PGlite();
  await seed(pg);
  const db = runner(pg);
  const reportBefore = await db.query("SELECT * FROM checkout_reports");
  const feedbackBefore = await db.query("SELECT * FROM app_feedback");

  const changed = await applyOwnerEmailSwap(db, ORG);
  assert.ok(changed > 0);

  const users = await db.query(
    "SELECT id, name, email, role, active FROM app_users ORDER BY id"
  );
  assert.deepEqual(users, [
    {
      id: "user-ashley",
      name: "Ashley",
      email: "ashley@warecovery.com",
      role: "super_admin",
      active: true,
    },
    {
      id: "user-driver",
      name: "Driver",
      email: "driver@fleetcheck.local",
      role: "driver",
      active: true,
    },
    {
      id: "user-james",
      name: "James",
      email: "james@warecovery.com",
      role: "super_admin",
      active: true,
    },
    {
      id: "user-office",
      name: "Office",
      email: "retired-user-office@fleetcheck.local",
      role: "super_admin",
      active: false,
    },
    {
      id: "user-tech",
      name: "Tech",
      email: "tech@fleetcheck.local",
      role: "tech",
      active: true,
    },
  ]);

  const memberships = await db.query(
    "SELECT user_id, role FROM org_memberships ORDER BY user_id"
  );
  assert.deepEqual(memberships, [
    { user_id: "user-ashley", role: "owner" },
    { user_id: "user-james", role: "owner" },
    { user_id: "user-office", role: "office" },
  ]);

  const session = await db.query("SELECT token_hash, user_id FROM auth_sessions");
  assert.deepEqual(session, [{ token_hash: "office-session", user_id: "user-ashley" }]);

  const invites = await db.query(
    "SELECT id, token_hash, user_id, email FROM auth_invites ORDER BY id"
  );
  assert.deepEqual(invites, [
    {
      id: "invite-ashley",
      token_hash: "hash-ashley",
      user_id: "user-ashley",
      email: "ashley@warecovery.com",
    },
    {
      id: "invite-office",
      token_hash: "hash-office",
      user_id: "user-ashley",
      email: "ashley@warecovery.com",
    },
  ]);

  assert.deepEqual(await db.query("SELECT * FROM checkout_reports"), reportBefore);
  assert.deepEqual(await db.query("SELECT * FROM app_feedback"), feedbackBefore);

  const signedIn = await findUserByEmail(db, ORG, "Ashley@Warecovery.com");
  assert.equal(signedIn?.id, "user-ashley");
  assert.equal(await findUserByEmail(db, ORG, "ashley@fleetcheck.local"), undefined);

  const again = await applyOwnerEmailSwap(db, ORG);
  assert.equal(again, 0);
  assert.deepEqual(
    await db.query("SELECT id, name, email, role, active FROM app_users ORDER BY id"),
    users
  );
  await pg.close();
});

test("the swap ignores every other company", async () => {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  await pg.exec(`
    INSERT INTO app_users (id, name, email, role, active, created_at, org_id) VALUES
      ('other-ashley', 'Ashley', 'ashley@fleetcheck.local', 'super_admin', true, NOW(), 'org-other');
  `);
  const db = runner(pg);
  assert.equal(await applyOwnerEmailSwap(db, "org-other"), 0);
  const rows = await db.query("SELECT email FROM app_users");
  assert.equal(rows[0].email, "ashley@fleetcheck.local");
  await pg.close();
});

test("a duplicate account holding james's email is retired onto his owner account", async () => {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  await pg.exec(`
    INSERT INTO app_users (id, name, email, role, active, created_at, org_id) VALUES
      ('user-james', 'James', 'james@fleetcheck.local', 'super_admin', true, NOW(), '${ORG}'),
      ('user-other', 'James Hutchinson', 'james@warecovery.com', 'super_admin', true, NOW(), '${ORG}');
    INSERT INTO org_memberships (id, org_id, user_id, role, created_at) VALUES
      ('member-user-james', '${ORG}', 'user-james', 'owner', NOW()),
      ('member-user-other', '${ORG}', 'user-other', 'owner', NOW());
    INSERT INTO auth_sessions (token_hash, user_id, org_id, role, expires_at, created_at)
      VALUES ('other-session', 'user-other', '${ORG}', 'owner', NOW() + INTERVAL '1 day', NOW());
    INSERT INTO checkout_reports (id, org_id, driver_name, dispatcher_name, reviewed_by)
      VALUES ('report-2', '${ORG}', 'Amber', 'James Hutchinson', 'James Hutchinson');
  `);
  const db = runner(pg);
  const reportBefore = await db.query("SELECT * FROM checkout_reports");
  await applyOwnerEmailSwap(db, ORG);
  const rows = await db.query(
    "SELECT id, name, email, active FROM app_users ORDER BY id"
  );
  assert.deepEqual(rows, [
    {
      id: "user-james",
      name: "James",
      email: "james@warecovery.com",
      active: true,
    },
    {
      id: "user-other",
      name: "James Hutchinson",
      email: "retired-user-other@fleetcheck.local",
      active: false,
    },
  ]);
  const session = await db.query("SELECT user_id FROM auth_sessions");
  assert.equal(session[0].user_id, "user-james");
  assert.deepEqual(await db.query("SELECT * FROM checkout_reports"), reportBefore);
  assert.equal(await applyOwnerEmailSwap(db, ORG), 0);
  await pg.close();
});
