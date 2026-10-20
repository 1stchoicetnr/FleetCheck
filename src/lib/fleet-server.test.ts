import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { FLEET_SEED_CREATED_AT, SEEDED_SERVER_FLEETS } from "./fleet-catalog.ts";
import * as orgData from "./server/org-data.ts";
import type { OrgDb } from "./server/org-data.ts";
import { OrgAccessError } from "./server/org-scope.ts";

const ORG = "org-1st-choice-rad-cab";
const OTHER = "org-other";

const SCHEMA = `
  CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    checklist_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    org_id TEXT NOT NULL
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
    org_id TEXT NOT NULL,
    fleet_id TEXT
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

test("seeding fleets is safe to rerun and Rad Cab units land on Rad Cab", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const data = runner(db);
  await orgData.seedCompany(data, ORG, {
    id: "company-rad-cab",
    name: "Rad Cab",
    slug: "rad-cab",
    checklistId: "photo-walkaround",
    createdAt: FLEET_SEED_CREATED_AT,
  });
  await orgData.seedCompany(data, ORG, {
    id: "company-1st-choice",
    name: "1st Choice Recovery",
    slug: "1st-choice",
    checklistId: "photo-walkaround",
    createdAt: FLEET_SEED_CREATED_AT,
  });
  for (const fleet of SEEDED_SERVER_FLEETS) {
    await orgData.seedFleet(data, ORG, { ...fleet, createdAt: FLEET_SEED_CREATED_AT });
  }
  await orgData.renameFleet(data, ORG, "fleet-rad-cab", "Rad Cab Night");
  for (const fleet of SEEDED_SERVER_FLEETS) {
    await orgData.seedFleet(data, ORG, {
      ...fleet,
      name: "Replaced",
      createdAt: FLEET_SEED_CREATED_AT,
    });
  }
  const fleets = await orgData.listFleets(data, ORG, false);
  assert.equal(fleets.length, SEEDED_SERVER_FLEETS.length);
  assert.equal(fleets.find((row) => row.id === "fleet-rad-cab")?.name, "Rad Cab Night");

  await orgData.seedVehicle(data, ORG, {
    id: "veh-14",
    companyId: "company-rad-cab",
    unitNumber: "14",
    plate: "RAD14",
    make: "Toyota",
    model: "Camry",
    year: 2018,
    lastMileage: null,
    createdAt: FLEET_SEED_CREATED_AT,
    powertrain: "gas",
  });
  await orgData.upsertVehicle(data, ORG, {
    id: "veh-kept",
    companyId: "company-rad-cab",
    unitNumber: "2",
    plate: "KEPT2",
    make: "Toyota",
    model: "Prius",
    year: 2019,
    lastMileage: null,
    createdAt: FLEET_SEED_CREATED_AT,
    powertrain: "gas",
    fleetId: "fleet-1st-choice",
  });
  await orgData.assignVehiclesToFleet(data, ORG, "fleet-rad-cab", "company-rad-cab");
  await orgData.assignVehiclesToFleet(data, ORG, "fleet-rad-cab", "company-rad-cab");
  const vehicles = await orgData.listVehicles(data, ORG, "company-rad-cab", true);
  const byId = new Map(vehicles.map((row) => [String(row.id), row.fleet_id]));
  assert.equal(byId.get("veh-14"), "fleet-rad-cab");
  assert.equal(byId.get("veh-kept"), "fleet-1st-choice");
  assert.deepEqual(await orgData.listFleets(data, OTHER, false), []);
  await assert.rejects(
    () => orgData.renameFleet(data, OTHER, "fleet-rad-cab", "Nope"),
    OrgAccessError
  );
});
