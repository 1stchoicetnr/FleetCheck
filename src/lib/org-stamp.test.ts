import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyOrgStamp,
  FIRST_CHOICE_ORG_ID,
  FIRST_CHOICE_ORG_NAME,
  FIRST_CHOICE_ORG_SLUG,
  type SqlRunner,
} from "./server/org-stamp.ts";

const SCHEMA = `
  CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    checklist_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE vehicles (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    plate TEXT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE checkout_reports (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    plate TEXT,
    completed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE fleet_alerts (
    id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE app_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL
  );
  CREATE TABLE app_feedback (
    id TEXT PRIMARY KEY,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE fleet_settings (
    id TEXT PRIMARY KEY,
    allow_driver_add_vehicles BOOLEAN NOT NULL
  );
`;

function runner(db: PGlite): SqlRunner {
  return {
    async query(text, params) {
      const result = await db.query(text, params);
      return result.rows as Record<string, unknown>[];
    },
  };
}

async function seed(db: PGlite): Promise<void> {
  await db.exec(SCHEMA);
  await db.exec(`
    INSERT INTO companies (id, name, slug, checklist_id, created_at) VALUES
      ('company-rad-cab', 'Rad Cab', 'rad-cab', 'radcab_default', '2024-01-01'),
      ('company-turo', 'Turo', 'turo', 'generic_30', '2024-01-01'),
      ('company-1st-choice', '1st Choice Recovery', '1st-choice-recovery', 'generic_30', '2024-01-01');
    INSERT INTO vehicles (id, company_id, unit_number, plate, make, model, year, created_at) VALUES
      ('vehicle-radcab-12', 'company-rad-cab', '12', 'RC-0012', 'Dodge', 'Grand Caravan', 2018, '2024-01-02'),
      ('vehicle-other-9012', 'company-turo', '9012', 'TUR-9012', 'Chrysler', '200', 2015, '2024-01-02');
    INSERT INTO checkout_reports (id, company_id, vehicle_id, unit_number, plate, completed_at, created_at) VALUES
      ('report-1', 'company-rad-cab', 'vehicle-radcab-12', '12', 'RC-0012', '2024-06-01', '2024-06-01'),
      ('report-2', 'company-turo', 'vehicle-other-9012', '9012', 'TUR-9012', '2024-06-02', '2024-06-02');
    INSERT INTO fleet_alerts (id, message, created_at) VALUES
      ('alert-1', 'Damage reported', '2024-06-01');
    INSERT INTO app_users (id, name, email, role) VALUES
      ('user-ashley', 'Ashley', 'ashley@fleetcheck.local', 'super_admin'),
      ('user-driver', 'Driver', 'driver@fleetcheck.local', 'driver');
    INSERT INTO app_feedback (id, note, created_at) VALUES
      ('feedback-1', 'Button stuck', '2024-07-01');
    INSERT INTO fleet_settings (id, allow_driver_add_vehicles) VALUES
      ('app', FALSE);
  `);
}

async function fleetSnapshot(db: PGlite) {
  const companies = await db.query(
    "SELECT id, name, slug FROM companies ORDER BY id"
  );
  const vehicles = await db.query(
    "SELECT id, company_id, plate, unit_number, make, model FROM vehicles ORDER BY id"
  );
  const reports = await db.query(
    "SELECT id, company_id, plate, unit_number FROM checkout_reports ORDER BY id"
  );
  return {
    companies: companies.rows,
    vehicles: vehicles.rows,
    reports: reports.rows,
  };
}

test("org stamp is idempotent and leaves fleet ids and row counts unchanged", async () => {
  const db = new PGlite();
  await seed(db);
  const beforeFleets = await fleetSnapshot(db);
  const beforeCounts = {
    companies: 3,
    vehicles: 2,
    reports: 2,
    alerts: 1,
    users: 2,
    feedback: 1,
    settings: 1,
  };

  const first = await applyOrgStamp(runner(db));
  const second = await applyOrgStamp(runner(db));
  const afterFleets = await fleetSnapshot(db);

  assert.equal(first.orgId, FIRST_CHOICE_ORG_ID);
  assert.deepEqual(first.before, first.after);
  assert.deepEqual(second.before, second.after);
  assert.equal(first.before.companies, beforeCounts.companies);
  assert.equal(first.before.vehicles, beforeCounts.vehicles);
  assert.equal(first.before.checkout_reports, beforeCounts.reports);
  assert.equal(first.before.fleet_alerts, beforeCounts.alerts);
  assert.equal(first.before.app_users, beforeCounts.users);
  assert.equal(first.before.app_feedback, beforeCounts.feedback);
  assert.equal(first.before.fleet_settings, beforeCounts.settings);
  assert.deepEqual(second.filled, {
    companies: 0,
    vehicles: 0,
    checkout_reports: 0,
    fleet_alerts: 0,
    app_users: 0,
    app_feedback: 0,
    fleet_settings: 0,
  });
  assert.deepEqual(afterFleets, beforeFleets);

  const orgs = await db.query("SELECT id, name, slug FROM orgs ORDER BY id");
  assert.deepEqual(orgs.rows, [
    {
      id: FIRST_CHOICE_ORG_ID,
      name: FIRST_CHOICE_ORG_NAME,
      slug: FIRST_CHOICE_ORG_SLUG,
    },
  ]);

  const stamped = await db.query<{ n: number }>(`
    SELECT
      (SELECT COUNT(*)::int FROM companies WHERE org_id = '${FIRST_CHOICE_ORG_ID}')
      + (SELECT COUNT(*)::int FROM vehicles WHERE org_id = '${FIRST_CHOICE_ORG_ID}')
      + (SELECT COUNT(*)::int FROM checkout_reports WHERE org_id = '${FIRST_CHOICE_ORG_ID}')
      + (SELECT COUNT(*)::int FROM fleet_alerts WHERE org_id = '${FIRST_CHOICE_ORG_ID}')
      + (SELECT COUNT(*)::int FROM app_users WHERE org_id = '${FIRST_CHOICE_ORG_ID}')
      + (SELECT COUNT(*)::int FROM app_feedback WHERE org_id = '${FIRST_CHOICE_ORG_ID}')
      + (SELECT COUNT(*)::int FROM fleet_settings WHERE org_id = '${FIRST_CHOICE_ORG_ID}')
      AS n
  `);
  assert.equal(Number(stamped.rows[0].n), 3 + 2 + 2 + 1 + 2 + 1 + 1);

  const required = await db.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'org_id' AND is_nullable = 'NO'
      AND table_schema = 'public'
    ORDER BY table_name
  `);
  assert.deepEqual(
    required.rows.map((row) => row.table_name),
    [
      "app_feedback",
      "app_users",
      "checkout_reports",
      "companies",
      "fleet_alerts",
      "fleet_settings",
      "vehicles",
    ]
  );

  const indexes = await db.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes
     WHERE indexname IN ('checkout_reports_org_completed_idx', 'vehicles_org_plate_idx')
     ORDER BY indexname`
  );
  assert.deepEqual(
    indexes.rows.map((row) => row.indexname),
    ["checkout_reports_org_completed_idx", "vehicles_org_plate_idx"]
  );

  await assert.rejects(
    () => db.query("INSERT INTO vehicles (id, company_id, unit_number, plate, make, model, year, created_at, org_id) VALUES ('v-null', 'company-rad-cab', '1', 'AAA', 'A', 'B', 2020, '2024-01-01', NULL)"),
    /null value in column "org_id"/
  );

  await db.query(
    "INSERT INTO fleet_alerts (id, message, created_at) VALUES ('alert-2', 'later', '2024-08-01')"
  );
  const defaulted = await db.query<{ org_id: string }>(
    "SELECT org_id FROM fleet_alerts WHERE id = 'alert-2'"
  );
  assert.equal(defaulted.rows[0].org_id, FIRST_CHOICE_ORG_ID);

  await db.close();
});

test("a later stamp does not replace an org_id that is already set", async () => {
  const db = new PGlite();
  await seed(db);
  await applyOrgStamp(runner(db));
  await db.query("UPDATE vehicles SET org_id = 'org-keep' WHERE id = 'vehicle-other-9012'");
  const before = await fleetSnapshot(db);
  await applyOrgStamp(runner(db));
  const kept = await db.query<{ org_id: string; company_id: string }>(
    "SELECT org_id, company_id FROM vehicles WHERE id = 'vehicle-other-9012'"
  );
  assert.equal(kept.rows[0].org_id, "org-keep");
  assert.equal(kept.rows[0].company_id, "company-turo");
  assert.deepEqual(await fleetSnapshot(db), before);
  const orgs = await db.query("SELECT COUNT(*)::int AS n FROM orgs");
  assert.equal(Number(orgs.rows[0].n), 1);
  await db.close();
});
