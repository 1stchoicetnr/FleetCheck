import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyRolloutSlate,
  recomputeVehicleMileage,
  type OrgDb,
} from "./server/org-data.ts";
import {
  isBeforeRolloutSlate,
  isOnRolloutDay,
  liveOdometer,
  rolloutSlateCutoffIso,
  rolloutSlateLogLines,
  rolloutUserDecision,
} from "./rollout-slate.ts";

const ORG = "org-1st-choice-rad-cab";
const CUTOFF = "2026-10-21T07:00:00.000Z";

const SCHEMA = `
  CREATE TABLE checkout_reports (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    odometer INT NOT NULL,
    review_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb
  );
  CREATE TABLE fleet_alerts (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ,
    message TEXT NOT NULL
  );
  CREATE TABLE vehicles (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    last_mileage INT
  );
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
  CREATE TABLE fleet_settings (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    allow_driver_add_vehicles BOOLEAN NOT NULL DEFAULT FALSE
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

test("rollout cutoff is midnight in Los Angeles", () => {
  assert.equal(rolloutSlateCutoffIso(), CUTOFF);
  assert.equal(isBeforeRolloutSlate("2026-10-21T06:59:59.000Z"), true);
  assert.equal(isBeforeRolloutSlate(CUTOFF), false);
  assert.equal(isOnRolloutDay("2026-10-21T07:00:00.000Z"), true);
  assert.equal(isOnRolloutDay("2026-10-21T06:59:59.000Z"), false);
  assert.equal(isOnRolloutDay("2026-10-22T06:59:59.000Z"), true);
  assert.equal(isOnRolloutDay("2026-10-22T07:00:00.000Z"), false);
});

test("demo logins are deactivated and ambiguous James rows stay", () => {
  assert.equal(
    rolloutUserDecision({
      id: "ashley-real",
      name: "Ashley",
      email: "Ashley@RadCab.biz",
      createdAt: "2026-10-01T00:00:00.000Z",
    }).action,
    "keep"
  );
  assert.equal(
    rolloutUserDecision({
      id: "james-real",
      name: "James",
      email: "james@warecovery.com",
      createdAt: "2026-10-01T00:00:00.000Z",
    }).reason,
    "named owner"
  );
  assert.equal(
    rolloutUserDecision({
      id: "user-office",
      name: "Office",
      email: "ashley@warecovery.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    }).reason,
    "old office email"
  );
  assert.equal(
    rolloutUserDecision({
      id: "user-tech",
      name: "Tech",
      email: "tech@fleetcheck.local",
      createdAt: "2024-01-01T00:00:00.000Z",
    }).reason,
    "fleetcheck.local demo"
  );
  assert.equal(
    rolloutUserDecision({
      id: "user-james",
      name: "James",
      email: "james@fleetcheck.local",
      createdAt: "2024-01-01T00:00:00.000Z",
    }).reason,
    "retired duplicate James"
  );
  assert.equal(
    rolloutUserDecision({
      id: "user-other",
      name: "James Hutchinson",
      email: "retired-user-other@fleetcheck.local",
      createdAt: "2024-06-01T00:00:00.000Z",
    }).reason,
    "retired duplicate James"
  );
  const ambiguous = rolloutUserDecision({
    id: "james-other",
    name: "James",
    email: "james@example.com",
    createdAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(ambiguous.action, "ambiguous");
  assert.equal(
    rolloutUserDecision({
      id: "new-tech",
      name: "Tech",
      email: "tech@fleetcheck.local",
      createdAt: "2026-10-21T18:00:00.000Z",
    }).action,
    "keep"
  );
  assert.equal(
    rolloutUserDecision({
      id: "old-driver",
      name: "Sam",
      email: "sam@radcab.biz",
      createdAt: "2026-10-20T00:00:00.000Z",
      approvedAt: "2026-10-21T16:00:00.000Z",
    }).reason,
    "approved on rollout day"
  );
  assert.equal(
    rolloutUserDecision({
      id: "user-driver",
      name: "Driver",
      email: "driver@fleetcheck.local",
      createdAt: "2024-01-01T00:00:00.000Z",
      approvedAt: "2026-10-21T16:00:00.000Z",
    }).action,
    "deactivate"
  );
});

test("last mileage ignores archived reports", () => {
  const reports = [
    {
      vehicleId: "v1",
      odometer: 90000,
      completedAt: "2026-10-01T00:00:00.000Z",
      createdAt: "2026-10-01T00:00:00.000Z",
      archivedAt: "2026-10-21T12:00:00.000Z",
    },
    {
      vehicleId: "v1",
      odometer: 100,
      completedAt: "2026-10-22T00:00:00.000Z",
      createdAt: "2026-10-22T00:00:00.000Z",
    },
    {
      vehicleId: "v2",
      odometer: 500,
      completedAt: "2026-10-02T00:00:00.000Z",
      createdAt: "2026-10-02T00:00:00.000Z",
      archivedAt: "2026-10-21T12:00:00.000Z",
    },
  ];
  assert.equal(liveOdometer(reports, "v1"), 100);
  assert.equal(liveOdometer(reports, "v2"), undefined);
});

test("the slate archives old rows, deactivates demo users, and can run twice", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const photo = JSON.stringify([{ url: "https://blob.example/windshield.jpg" }]);
  await db.exec(`
    INSERT INTO fleet_settings (id, org_id) VALUES ('app', '${ORG}');
    INSERT INTO vehicles (id, org_id, last_mileage) VALUES
      ('v1', '${ORG}', 128440),
      ('v2', '${ORG}', 87210);
    INSERT INTO checkout_reports (
      id, org_id, company_id, vehicle_id, odometer, review_status, created_at, completed_at, photos
    ) VALUES
      ('old', '${ORG}', 'company-rad-cab', 'v1', 128440, 'pending', '2026-10-20T12:00:00Z', '2026-10-20T12:00:00Z', '${photo}'::jsonb),
      ('today', '${ORG}', 'company-rad-cab', 'v2', 10, 'pending', '${CUTOFF}', '${CUTOFF}', '[]'::jsonb);
    INSERT INTO fleet_alerts (id, org_id, created_at, message) VALUES
      ('a-old', '${ORG}', '2026-10-19T00:00:00Z', 'old damage'),
      ('a-new', '${ORG}', '${CUTOFF}', 'today');
    INSERT INTO app_users (id, name, email, role, active, created_at, org_id, password_hash) VALUES
      ('ashley', 'Ashley', 'ashley@radcab.biz', 'super_admin', true, '2026-10-18T00:00:00Z', '${ORG}', 'hash-ashley'),
      ('james', 'James', 'james@warecovery.com', 'super_admin', true, '2026-10-18T00:00:00Z', '${ORG}', 'hash-james'),
      ('office', 'Office', 'ashley@warecovery.com', 'management', true, '2024-01-01T00:00:00Z', '${ORG}', 'hash-office'),
      ('tech', 'Tech', 'tech@fleetcheck.local', 'tech', true, '2024-01-01T00:00:00Z', '${ORG}', 'hash-tech'),
      ('seed-james', 'James', 'james@fleetcheck.local', 'super_admin', true, '2024-01-01T00:00:00Z', '${ORG}', 'hash-seed'),
      ('dup', 'James Hutchinson', 'retired-dup@fleetcheck.local', 'super_admin', false, '2024-06-01T00:00:00Z', '${ORG}', 'hash-dup'),
      ('other-james', 'James', 'james@example.com', 'driver', true, '2026-09-01T00:00:00Z', '${ORG}', 'hash-other'),
      ('today-user', 'Sam', 'sam@radcab.biz', 'driver', true, '2026-10-21T18:00:00Z', '${ORG}', 'hash-sam');
    INSERT INTO auth_sessions (token_hash, user_id, org_id, role, expires_at, created_at) VALUES
      ('sess-tech', 'tech', '${ORG}', 'office', '2026-11-01T00:00:00Z', '2026-10-01T00:00:00Z'),
      ('sess-ashley', 'ashley', '${ORG}', 'owner', '2026-11-01T00:00:00Z', '2026-10-01T00:00:00Z');
  `);

  const first = await applyRolloutSlate(org, ORG, "2026-10-21T15:00:00.000Z");
  assert.ok(first);
  assert.equal(first.alreadyApplied, false);
  assert.equal(first.before.openReports, 2);
  assert.equal(first.before.pendingReports, 2);
  assert.equal(first.before.openAlerts, 2);
  assert.equal(first.archivedReports, 1);
  assert.equal(first.archivedAlerts, 1);
  assert.equal(first.after.openReports, 1);
  assert.equal(first.after.pendingReports, 1);
  assert.equal(first.after.openAlerts, 1);
  assert.equal(first.mileageFromLive, 1);
  assert.equal(first.mileageCleared, 1);

  const reports = await db.query(
    "SELECT id, archived_at IS NOT NULL AS archived, photos::text AS photos FROM checkout_reports ORDER BY id"
  );
  assert.equal(reports.rows.length, 2);
  const byId = Object.fromEntries(
    reports.rows.map((row) => [String(row.id), row])
  );
  assert.equal(byId.old.archived, true);
  assert.match(String(byId.old.photos), /blob\.example\/windshield\.jpg/);
  assert.equal(byId.today.archived, false);

  const alerts = await db.query("SELECT COUNT(*)::int AS n FROM fleet_alerts");
  assert.equal(alerts.rows[0].n, 2);

  const users = await db.query(
    "SELECT id, active FROM app_users ORDER BY id"
  );
  const active = Object.fromEntries(
    users.rows.map((row) => [String(row.id), row.active])
  );
  assert.equal(users.rows.length, 8);
  assert.equal(active.ashley, true);
  assert.equal(active.james, true);
  assert.equal(active["today-user"], true);
  assert.equal(active["other-james"], true);
  assert.equal(active.office, false);
  assert.equal(active.tech, false);
  assert.equal(active["seed-james"], false);
  assert.equal(active.dup, false);

  const reasons = Object.fromEntries(
    first.deactivated.map((user) => [user.id, user.reason])
  );
  assert.equal(reasons.office, "old office email");
  assert.equal(reasons.tech, "fleetcheck.local demo");
  assert.equal(reasons["seed-james"], "retired duplicate James");
  assert.equal(reasons.dup, "retired duplicate James");
  assert.equal(first.ambiguous.length, 1);
  assert.equal(first.ambiguous[0]?.email, "james@example.com");
  assert.equal(
    first.kept.some((user) => user.email === "ashley@radcab.biz"),
    true
  );
  assert.equal(
    first.kept.some((user) => user.email === "james@warecovery.com"),
    true
  );

  const sessions = await db.query("SELECT token_hash FROM auth_sessions ORDER BY token_hash");
  assert.deepEqual(
    sessions.rows.map((row) => row.token_hash),
    ["sess-ashley"]
  );

  const mileage = await db.query(
    "SELECT id, last_mileage FROM vehicles ORDER BY id"
  );
  assert.equal(mileage.rows[0].last_mileage, null);
  assert.equal(mileage.rows[1].last_mileage, 10);

  const lines = rolloutSlateLogLines(first).join("\n");
  assert.match(lines, /before open_reports=2/);
  assert.match(lines, /after open_reports=1/);
  assert.doesNotMatch(lines, /hash-/);
  assert.doesNotMatch(lines, /password/i);

  await db.query("UPDATE app_users SET active = TRUE WHERE id = 'tech'");
  const second = await applyRolloutSlate(org, ORG, "2026-10-21T16:00:00.000Z");
  assert.ok(second);
  assert.equal(second.alreadyApplied, true);
  assert.equal(second.after.openReports, 1);
  const tech = await db.query("SELECT active FROM app_users WHERE id = 'tech'");
  assert.equal(tech.rows[0].active, true);

  await recomputeVehicleMileage(org, ORG, "v2");
  const again = await db.query("SELECT last_mileage FROM vehicles WHERE id = 'v2'");
  assert.equal(again.rows[0].last_mileage, 10);
});
