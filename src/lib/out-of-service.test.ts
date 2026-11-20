import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  blocksCheckout,
  canReturnToReady,
  canSetOutOfService,
  cleanOutOfServiceInput,
  OUT_OF_SERVICE_MESSAGE,
  parseOutOfService,
} from "./out-of-service.ts";
import { setVehicleOutOfServiceRow, type OrgDb } from "./server/org-data.ts";

const OOS = { since: "2026-11-20T17:00:00.000Z", by: "Bell", reason: "Bumper hanging" };

test("the driver sees the exact message", () => {
  assert.equal(OUT_OF_SERVICE_MESSAGE, "This unit is out of service. See the office.");
});

test("Office can set Out of Service; only Manager/Owner can set it back to Ready", () => {
  assert.equal(canSetOutOfService("office"), true);
  assert.equal(canSetOutOfService("manager"), true);
  assert.equal(canSetOutOfService("owner"), true);
  assert.equal(canSetOutOfService("driver"), false);
  assert.equal(canSetOutOfService(undefined), false);
  assert.equal(canReturnToReady("office"), false);
  assert.equal(canReturnToReady("driver"), false);
  assert.equal(canReturnToReady("manager"), true);
  assert.equal(canReturnToReady("owner"), true);
});

test("request body", () => {
  assert.equal(cleanOutOfServiceInput({ archived: true }), null, "other unit edits pass through");
  assert.deepEqual(cleanOutOfServiceInput({ outOfService: "yes" }), { error: "outOfService must be true or false." });
  assert.deepEqual(cleanOutOfServiceInput({ outOfService: false, reason: "x" }), { outOfService: false });
  assert.deepEqual(cleanOutOfServiceInput({ outOfService: true, reason: "  hood \n latch  " }), {
    outOfService: true,
    reason: "hood latch",
  });
  assert.deepEqual(cleanOutOfServiceInput({ outOfService: true }), { outOfService: true });
});

test("stored value parses; junk is ignored", () => {
  assert.deepEqual(parseOutOfService(OOS), OOS);
  assert.deepEqual(parseOutOfService(JSON.stringify(OOS)), OOS);
  assert.equal(parseOutOfService(null), undefined);
  assert.equal(parseOutOfService("nope"), undefined);
  assert.equal(parseOutOfService({ by: "x" }), undefined);
  assert.deepEqual(parseOutOfService({ since: OOS.since }), { since: OOS.since, by: "Office" });
});

test("new check-outs are blocked; check-ins and checks started earlier go through", () => {
  assert.equal(blocksCheckout(undefined, "check_out", undefined), false);
  assert.equal(blocksCheckout(OOS, "check_out", undefined), true);
  assert.equal(blocksCheckout(OOS, undefined, "2026-11-20T18:00:00Z"), true);
  assert.equal(blocksCheckout(OOS, "check_out", "2026-11-20T16:59:00Z"), false, "started before, sat in outbox");
  assert.equal(blocksCheckout(OOS, "check_in", undefined), false);
  assert.equal(blocksCheckout(OOS, "check_out", "garbage"), true);
});

test("Out of Service is saved on the unit, scoped to the org", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE vehicles (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, out_of_service JSONB);
    INSERT INTO vehicles VALUES ('v8', 'org-1', NULL), ('v9', 'org-2', NULL);
  `);
  const db: OrgDb = { query: async (t, p) => (await pg.query(t, p)).rows as Record<string, unknown>[] };
  assert.equal(await setVehicleOutOfServiceRow(db, "org-1", "v9", JSON.stringify(OOS)), false);
  assert.equal(await setVehicleOutOfServiceRow(db, "org-1", "v8", JSON.stringify(OOS)), true);
  const rows = (await pg.query("SELECT id, out_of_service FROM vehicles ORDER BY id")).rows as Array<{ id: string; out_of_service: unknown }>;
  assert.deepEqual(parseOutOfService(rows[0].out_of_service), OOS);
  assert.equal(rows[1].out_of_service, null);
  assert.equal(await setVehicleOutOfServiceRow(db, "org-1", "v8", null), true);
  const cleared = (await pg.query("SELECT out_of_service FROM vehicles WHERE id='v8'")).rows[0] as { out_of_service: unknown };
  assert.equal(cleared.out_of_service, null);
  await pg.close();
});
