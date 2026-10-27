import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { mayUpdateCheckout, reportBelongsToDriver } from "./checkout-access.ts";
import { listReportsForDriver, type OrgDb } from "./server/org-data.ts";

test("only the signed-in driver or office can update a check", () => {
  assert.equal(
    mayUpdateCheckout({
      office: false,
      userId: "user-ada",
      userName: "Ada",
      driverUserId: "user-ada",
      driverName: "Ada Lovelace",
    }),
    true
  );
  assert.equal(
    mayUpdateCheckout({
      office: false,
      userId: "user-sam",
      userName: "Ada",
      driverUserId: "user-ada",
      driverName: "Ada",
    }),
    false
  );
  assert.equal(
    mayUpdateCheckout({
      office: true,
      userId: "user-office",
      userName: "Office",
      driverUserId: "user-ada",
      driverName: "Ada",
    }),
    true
  );
  assert.equal(
    mayUpdateCheckout({
      office: false,
      userId: "user-ada",
      userName: "Ada Lovelace",
      driverUserId: null,
      driverName: "ada lovelace",
    }),
    true
  );
  assert.equal(
    mayUpdateCheckout({
      office: false,
      userId: "user-sam",
      userName: "Sam",
      driverUserId: null,
      driverName: "Ada",
    }),
    false
  );
});

test("my checks follow the user id and still include older name matches", () => {
  assert.equal(
    reportBelongsToDriver(
      { driverUserId: "user-ada", driverName: "Old Name" },
      { userId: "user-ada", name: "Ada" }
    ),
    true
  );
  assert.equal(
    reportBelongsToDriver(
      { driverUserId: "user-ada", driverName: "Ada" },
      { userId: "user-sam", name: "Ada" }
    ),
    false
  );
  assert.equal(
    reportBelongsToDriver({ driverUserId: null, driverName: "Ada" }, { userId: "user-ada", name: "Ada" }),
    true
  );
});

test("stored checks list by user id and still include older name-only rows", async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE checkout_reports (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      driver_name TEXT NOT NULL,
      driver_user_id TEXT,
      archived_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ NOT NULL
    );
  `);
  const orgDb: OrgDb = {
    query: async (text, params) => {
      const result = await db.query(text, params);
      return result.rows as Record<string, unknown>[];
    },
    exec: (text) => db.exec(text),
  };
  await db.exec(`
    INSERT INTO checkout_reports (id, org_id, driver_name, driver_user_id, completed_at)
    VALUES
      ('new', 'rad-cab', 'Ada Lovelace', 'user-ada', '2026-10-27T00:00:00Z'),
      ('old', 'rad-cab', 'Ada', NULL, '2026-10-26T00:00:00Z'),
      ('other', 'rad-cab', 'Ada', 'user-sam', '2026-10-25T00:00:00Z');
  `);
  const rows = await listReportsForDriver(orgDb, "rad-cab", "Ada", "user-ada");
  assert.deepEqual(
    rows.map((row) => row.id),
    ["new", "old"]
  );
  await db.close();
});
