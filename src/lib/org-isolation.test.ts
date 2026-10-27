import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import * as orgData from "./server/org-data.ts";
import type { OrgDb } from "./server/org-data.ts";
import {
  canReadStoredPath,
  checkoutObjectPath,
  feedbackObjectPath,
  OrgAccessError,
} from "./server/org-scope.ts";
import { persistCheckoutPhoto } from "./server/photo-store.ts";

const ORG_A = "org-a";
const ORG_B = "org-b";
const FLEET_A = "fleet-a";
const FLEET_B = "fleet-b";

const SCHEMA = `
  CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    checklist_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    org_id TEXT NOT NULL
  );
  CREATE TABLE vehicles (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    plate TEXT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INT NOT NULL,
    last_mileage INT,
    created_at TIMESTAMPTZ NOT NULL,
    powertrain TEXT,
    archived_at TIMESTAMPTZ,
    org_id TEXT NOT NULL
  );
  CREATE TABLE checkout_reports (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    plate TEXT,
    year INT NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    odometer INT NOT NULL,
    driver_name TEXT NOT NULL,
    dispatcher_name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    review_status TEXT NOT NULL,
    review_notes TEXT,
    new_damage_notes TEXT,
    retake_angles JSONB,
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    flagged BOOLEAN NOT NULL DEFAULT FALSE,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    signature_data_url TEXT,
    signed_at TIMESTAMPTZ,
    inspection_form JSONB,
    archived_at TIMESTAMPTZ,
    idempotency_key TEXT,
    sent_at TIMESTAMPTZ,
    driver_user_id TEXT
  );
  CREATE TABLE fleet_alerts (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    vehicle_plate TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    report_id TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ
  );
  CREATE TABLE app_feedback (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    type TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    delivered_via TEXT NOT NULL
  );
  CREATE TABLE app_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    org_id TEXT NOT NULL
  );
  CREATE TABLE fleet_settings (
    id TEXT PRIMARY KEY,
    allow_driver_add_vehicles BOOLEAN NOT NULL,
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

async function seed(db: PGlite): Promise<void> {
  await db.exec(SCHEMA);
  await db.exec(`
    INSERT INTO companies (id, name, slug, checklist_id, created_at, org_id) VALUES
      ('${FLEET_A}', 'Fleet A', 'fleet-a', 'generic_30', '2024-01-01', '${ORG_A}'),
      ('${FLEET_B}', 'Fleet B', 'fleet-b', 'generic_30', '2024-01-01', '${ORG_B}');
    INSERT INTO vehicles (
      id, company_id, unit_number, plate, make, model, year, created_at, org_id
    ) VALUES
      ('veh-a', '${FLEET_A}', '1', 'AAA111', 'Ford', 'Transit', 2020, '2024-02-01', '${ORG_A}'),
      ('veh-b', '${FLEET_B}', '2', 'BBB222', 'Ford', 'Transit', 2021, '2024-02-01', '${ORG_B}');
    INSERT INTO checkout_reports (
      id, org_id, company_id, vehicle_id, unit_number, plate, year, make, model, odometer,
      driver_name, dispatcher_name, type, status, completed_at, review_status, flagged, created_at
    ) VALUES
      ('rep-a', '${ORG_A}', '${FLEET_A}', 'veh-a', '1', 'AAA111', 2020, 'Ford', 'Transit', 10,
        'Ada', 'Office', 'check_out', 'complete', '2024-03-01', 'pending', false, '2024-03-01'),
      ('rep-b', '${ORG_B}', '${FLEET_B}', 'veh-b', '2', 'BBB222', 2021, 'Ford', 'Transit', 20,
        'Bea', 'Office', 'check_out', 'complete', '2024-03-02', 'pending', false, '2024-03-02');
    INSERT INTO fleet_alerts (
      id, org_id, type, message, vehicle_id, vehicle_plate, actor_name, report_id, created_at, read
    ) VALUES
      ('alert-a', '${ORG_A}', 'status_needs_work', 'A needs repair', 'veh-a', '1', 'Ada', 'rep-a', '2024-03-01', false),
      ('alert-b', '${ORG_B}', 'status_needs_work', 'B needs repair', 'veh-b', '2', 'Bea', 'rep-b', '2024-03-02', false);
    INSERT INTO app_feedback (id, org_id, type, note, created_at, delivered_via) VALUES
      ('fb-a', '${ORG_A}', 'Bug', 'from A', '2024-04-01', 'office'),
      ('fb-b', '${ORG_B}', 'Bug', 'from B', '2024-04-02', 'office');
    INSERT INTO app_users (id, name, email, role, created_at, org_id) VALUES
      ('user-a', 'Ada', 'ada@example.test', 'driver', '2024-01-01', '${ORG_A}'),
      ('user-b', 'Bea', 'bea@example.test', 'driver', '2024-01-01', '${ORG_B}');
  `);
}

function ids(rows: Array<Record<string, unknown>>): string[] {
  return rows.map((row) => String(row.id)).sort();
}

test("company A office lists never include company B", async () => {
  const db = new PGlite();
  await seed(db);
  const data = runner(db);
  const page = await orgData.listReportPage(data, ORG_A, {
    includeArchived: true,
    companyId: null,
    vehicleId: null,
    status: null,
    limit: 50,
    offset: 0,
  });
  assert.deepEqual(ids(page.rows), ["rep-a"]);
  assert.deepEqual(
    ids(await orgData.listVehicles(data, ORG_A, undefined, true)),
    ["veh-a"]
  );
  assert.deepEqual(ids(await orgData.listAlerts(data, ORG_A)), ["alert-a"]);
  assert.deepEqual(ids(await orgData.listFeedback(data, ORG_A)), ["fb-a"]);
  assert.deepEqual(ids(await orgData.listUsers(data, ORG_A)), ["user-a"]);
  assert.deepEqual(ids(await orgData.listCompanies(data, ORG_A)), [FLEET_A]);
});

test("opening B while signed in as A is not found", async () => {
  const db = new PGlite();
  await seed(db);
  const data = runner(db);
  assert.equal(await orgData.getReport(data, ORG_A, "rep-b"), undefined);
  assert.equal(await orgData.getVehicle(data, ORG_A, "veh-b"), undefined);
  assert.equal(await orgData.getUser(data, ORG_A, "user-b"), undefined);
  assert.equal(
    canReadStoredPath(ORG_A, `orgs/${ORG_B}/checkout/rep-b/front.jpg`),
    false
  );
  assert.equal(
    canReadStoredPath(ORG_A, `orgs/${ORG_B}/feedback/fb-b/shot.jpg`),
    false
  );
  assert.equal(canReadStoredPath(ORG_A, "checkout/rep-old/front.jpg"), true);
  assert.equal(canReadStoredPath(ORG_A, "feedback/fb-old/shot.jpg"), true);
  assert.equal(
    canReadStoredPath(ORG_A, `orgs/${ORG_A}/checkout/rep-a/front.jpg`),
    true
  );
  assert.equal(canReadStoredPath(ORG_A, "orgs/org-a"), false);
  assert.equal(canReadStoredPath(ORG_A, "checkout/../secret.jpg"), false);
  assert.equal(await orgData.deleteReport(data, ORG_A, "rep-b"), false);
  const stillThere = await orgData.getReport(data, ORG_B, "rep-b");
  assert.equal(stillThere?.id, "rep-b");
});

test("a driver in A cannot list or use B's fleet", async () => {
  const db = new PGlite();
  await seed(db);
  const data = runner(db);
  assert.deepEqual(ids(await orgData.listCompanies(data, ORG_A)), [FLEET_A]);
  await assert.rejects(
    () => orgData.assertFleetInOrg(data, ORG_A, FLEET_B),
    OrgAccessError
  );
  await assert.rejects(
    () => orgData.listVehicles(data, ORG_A, FLEET_B, false),
    OrgAccessError
  );
  await assert.rejects(
    () =>
      orgData.upsertVehicle(data, ORG_A, {
        id: "veh-new",
        companyId: FLEET_B,
        unitNumber: "9",
        plate: "NEW999",
        make: "Ford",
        model: "Transit",
        year: 2024,
        lastMileage: null,
        createdAt: "2024-05-01",
        powertrain: "gas",
      }),
    OrgAccessError
  );
  const vehicles = await db.query("SELECT id FROM vehicles ORDER BY id");
  assert.deepEqual(
    vehicles.rows.map((row) => String((row as { id: string }).id)),
    ["veh-a", "veh-b"]
  );
});

test("a checkout posted with B's fleet id while the session is A is rejected", async () => {
  const db = new PGlite();
  await seed(db);
  const data = runner(db);
  await assert.rejects(
    () =>
      orgData.upsertReport(data, ORG_A, {
        id: "rep-new",
        companyId: FLEET_B,
        vehicleId: "veh-a",
        unitNumber: "1",
        plate: "AAA111",
        year: 2020,
        make: "Ford",
        model: "Transit",
        odometer: 11,
        driverName: "Ada",
        dispatcherName: "Office",
        type: "check_out",
        status: "complete",
        completedAt: "2024-05-02",
        reviewStatus: "pending",
        reviewNotes: null,
        newDamageNotes: null,
        retakeAnglesJson: "[]",
        reviewedAt: null,
        reviewedBy: null,
        flagged: false,
        photosJson: "[]",
        createdAt: "2024-05-02",
        signatureDataUrl: null,
        signedAt: null,
        inspectionFormJson: "null",
      }),
    OrgAccessError
  );
  const reports = await db.query("SELECT id FROM checkout_reports ORDER BY id");
  assert.deepEqual(
    reports.rows.map((row) => String((row as { id: string }).id)),
    ["rep-a", "rep-b"]
  );
});

test("new uploads use the org prefix and old links stay put", async () => {
  assert.equal(
    checkoutObjectPath(ORG_A, "rep-a", "front", "jpg"),
    `orgs/${ORG_A}/checkout/rep-a/front.jpg`
  );
  assert.equal(
    feedbackObjectPath(ORG_A, "fb-a", "shot.jpg"),
    `orgs/${ORG_A}/feedback/fb-a/shot.jpg`
  );
  const existing = "https://example.com/checkout/rep-old/front-abc.jpg";
  assert.equal(
    await persistCheckoutPhoto(ORG_A, "rep-a", "front", existing),
    existing
  );
  assert.throws(() => checkoutObjectPath("  ", "rep-a", "front", "jpg"), OrgAccessError);
});
