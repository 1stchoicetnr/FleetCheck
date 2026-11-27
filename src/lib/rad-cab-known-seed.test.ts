import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { RAD_CAB_COMPANY_ID } from "./company-rules.ts";
import { parseKnownDamageList } from "./known-damage.ts";
import { mergeRadCabKnownSeed, unitNumbersMatch } from "./rad-cab-known-seed.ts";
import { getVehicleKnownDamage, seedRadCabKnownNotFixing, type OrgDb } from "./server/org-data.ts";

test("unit numbers match Rad Cab units and not their neighbors", () => {
  assert.equal(unitNumbersMatch("#8", "8"), true);
  assert.equal(unitNumbersMatch("08", "8"), true);
  assert.equal(unitNumbersMatch("Unit 2", "2"), true);
  assert.equal(unitNumbersMatch("11 Chrysler 200", "11"), true);
  assert.equal(unitNumbersMatch("18", "8"), false);
  assert.equal(unitNumbersMatch("80", "8"), false);
});

test("the seed is idempotent and stays inside Rad Cab", () => {
  const first = mergeRadCabKnownSeed("#9", RAD_CAB_COMPANY_ID, [], "v9");
  assert.equal(first.added, 2);
  assert.deepEqual(
    first.list.map((item) => [item.angle, item.description, item.status]),
    [
      ["front", "front bumper damage", "not_fixing"],
      ["rear", "rear bumper damage", "not_fixing"],
    ]
  );
  const second = mergeRadCabKnownSeed("9", RAD_CAB_COMPANY_ID, first.list, "v9");
  assert.equal(second.added, 0);
  assert.equal(second.list.length, 2);
  assert.equal(mergeRadCabKnownSeed("8", "company-turo", [], "other").added, 0);
  assert.equal(mergeRadCabKnownSeed("18", RAD_CAB_COMPANY_ID, [], "v18").added, 0);
  const eight = mergeRadCabKnownSeed("Unit 8", RAD_CAB_COMPANY_ID, [], "v8");
  assert.equal(eight.list[0].angle, "lf_corner");
  assert.equal(eight.list[0].description, "left-front bumper crack");
  const withExisting = mergeRadCabKnownSeed("#8", RAD_CAB_COMPANY_ID, eight.list, "v8");
  assert.equal(withExisting.added, 0);
  const repaired = mergeRadCabKnownSeed(
    "8",
    RAD_CAB_COMPANY_ID,
    [{ ...eight.list[0], id: "kd_other", repairedAt: "2026-11-01T00:00:00Z" }],
    "v8"
  );
  assert.equal(repaired.added, 0, "a repaired match is not added again");
});

function runner(pg: PGlite): OrgDb {
  return { query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[] };
}

test("seeding known damage does not clear open alerts and can run twice", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE vehicles (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      company_id TEXT,
      unit_number TEXT,
      known_damage JSONB
    );
    CREATE TABLE fleet_alerts (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      message TEXT,
      archived_at TIMESTAMPTZ
    );
    INSERT INTO vehicles VALUES
      ('v8', 'org-1', 'company-rad-cab', '#8', NULL),
      ('v9', 'org-1', 'company-rad-cab', '09', NULL),
      ('v2', 'org-1', 'company-rad-cab', 'Unit 2', NULL),
      ('v5', 'org-1', 'company-rad-cab', '5', NULL),
      ('v11', 'org-1', 'company-rad-cab', '11 Chrysler 200', NULL),
      ('v18', 'org-1', 'company-rad-cab', '18', NULL),
      ('t8', 'org-1', 'company-turo', '8', NULL);
    INSERT INTO fleet_alerts VALUES ('open-1', 'org-1', 'Found by photo check on Unit 9', NULL);
  `);
  const db = runner(pg);
  const added = await seedRadCabKnownNotFixing(db, "org-1");
  assert.equal(added, 6);
  const again = await seedRadCabKnownNotFixing(db, "org-1");
  assert.equal(again, 0);
  const v9 = parseKnownDamageList(await getVehicleKnownDamage(db, "org-1", "v9"), "v9");
  assert.deepEqual(
    v9.map((item) => item.description).sort(),
    ["front bumper damage", "rear bumper damage"]
  );
  assert.equal(v9.every((item) => item.status === "not_fixing"), true);
  assert.equal(parseKnownDamageList(await getVehicleKnownDamage(db, "org-1", "v18"), "v18").length, 0);
  assert.equal(parseKnownDamageList(await getVehicleKnownDamage(db, "org-1", "t8"), "t8").length, 0);
  const v8 = parseKnownDamageList(await getVehicleKnownDamage(db, "org-1", "v8"), "v8");
  assert.equal(v8[0].angle, "lf_corner");
  const alerts = await pg.query("SELECT id, message, archived_at FROM fleet_alerts");
  assert.equal(alerts.rows.length, 1);
  assert.equal(alerts.rows[0].id, "open-1");
  assert.equal(alerts.rows[0].archived_at, null);
  await pg.close();
});
