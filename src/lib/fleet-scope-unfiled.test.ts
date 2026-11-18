import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import * as orgData from "./server/org-data.ts";
import type { OrgDb } from "./server/org-data.ts";

function runner(db: PGlite): OrgDb {
  return {
    async query(text, params) {
      return (await db.query(text, params)).rows as Record<string, unknown>[];
    },
  };
}

test("office scoped to a fleet also sees units of that company with no fleet yet", async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE fleets (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, company_id TEXT NOT NULL);
    CREATE TABLE vehicles (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, company_id TEXT NOT NULL, fleet_id TEXT);
    INSERT INTO fleets VALUES ('taxi', 'org-a', 'rad-cab'), ('turo', 'org-a', 'turo-co'), ('other', 'org-b', 'rad-cab');
    INSERT INTO vehicles VALUES
      ('unit-5', 'org-a', 'rad-cab', 'taxi'),
      ('unit-by-plate', 'org-a', 'rad-cab', NULL),
      ('turo-car', 'org-a', 'turo-co', 'turo'),
      ('turo-unfiled', 'org-a', 'turo-co', NULL),
      ('other-org', 'org-b', 'rad-cab', NULL);
  `);
  const ids = await orgData.listVehicleIdsForFleets(runner(db), "org-a", ["taxi"]);
  assert.deepEqual(ids.sort(), ["unit-5", "unit-by-plate"]);
  assert.deepEqual(await orgData.listVehicleIdsForFleets(runner(db), "org-a", []), []);
});
