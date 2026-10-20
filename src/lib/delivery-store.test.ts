import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { HISTORICAL_SENT_BEFORE } from "./delivery-status.ts";
import * as orgData from "./server/org-data.ts";
import type { OrgDb } from "./server/org-data.ts";

function runner(db: PGlite): OrgDb {
  return {
    async query(text, params) {
      const result = await db.query(text, params);
      return result.rows as Record<string, unknown>[];
    },
  };
}

test("old checks are marked sent once, and a new upload stays open", async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      checklist_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
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
      sent_at TIMESTAMPTZ
    );
  `);
  const data = runner(db);
  await db.exec(`
    INSERT INTO companies (id, name, slug, checklist_id, created_at, org_id)
    VALUES ('fleet-a', 'Fleet A', 'fleet-a', 'generic_30', '2024-01-01', 'org-a');
  `);
  const base = {
    companyId: "fleet-a",
    vehicleId: "veh-1",
    unitNumber: "9",
    plate: "AAA111",
    year: 2011,
    make: "Dodge",
    model: "Journey",
    odometer: 10,
    driverName: "Ada",
    dispatcherName: "Office",
    type: "check_out",
    status: "complete",
    reviewStatus: "pending",
    reviewNotes: null,
    newDamageNotes: null,
    retakeAnglesJson: "[]",
    reviewedAt: null,
    reviewedBy: null,
    flagged: false,
    photosJson: '[{"angle":"front","dataUrl":"keep-me"}]',
    signatureDataUrl: null,
    signedAt: null,
    inspectionFormJson: "null",
  };
  await orgData.upsertReport(data, "org-a", {
    ...base,
    id: "old-1",
    completedAt: "2026-10-20T18:00:00.000Z",
    createdAt: "2026-10-20T18:00:00.000Z",
  });
  await orgData.upsertReport(data, "org-a", {
    ...base,
    id: "new-1",
    completedAt: "2026-10-20T20:00:00.000Z",
    createdAt: "2026-10-20T20:00:00.000Z",
  });
  const marked = await orgData.backfillHistoricalSent(data, "org-a", HISTORICAL_SENT_BEFORE);
  assert.equal(marked, 1);
  const again = await orgData.backfillHistoricalSent(data, "org-a", HISTORICAL_SENT_BEFORE);
  assert.equal(again, 0);
  const oldRow = await orgData.getReport(data, "org-a", "old-1");
  const newRow = await orgData.getReport(data, "org-a", "new-1");
  assert.ok(oldRow?.sent_at);
  assert.equal(newRow?.sent_at, null);
  assert.match(JSON.stringify(oldRow?.photos), /keep-me/);
  const first = await orgData.markReportSent(data, "org-a", "new-1", "2026-10-20T20:05:00.000Z");
  const second = await orgData.markReportSent(data, "org-a", "new-1", "2026-10-20T21:00:00.000Z");
  assert.equal(new Date(String(first?.sent_at)).toISOString(), "2026-10-20T20:05:00.000Z");
  assert.equal(new Date(String(second?.sent_at)).toISOString(), "2026-10-20T20:05:00.000Z");
  const stuck = await orgData.countStuckUploads(data, "org-a", "2026-10-20T20:30:00.000Z");
  assert.equal(stuck, 0);
  await db.exec(`UPDATE checkout_reports SET sent_at = NULL WHERE id = 'new-1'`);
  const waiting = await orgData.countStuckUploads(data, "org-a", "2026-10-20T20:30:00.000Z");
  assert.equal(waiting, 1);
  const mine = await orgData.listReportsForDriver(data, "org-a", "ada");
  assert.equal(mine.length, 2);
});
