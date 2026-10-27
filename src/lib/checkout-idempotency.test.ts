import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import * as orgData from "./server/org-data.ts";
import type { OrgDb } from "./server/org-data.ts";
import {
  deliverOutboxItem,
  failureDelay,
  idempotencyKeyForDraft,
  IDEMPOTENCY_KEY_RE,
  isPermanentOutboxError,
  isUniqueViolation,
  mergeOutboxAttempt,
  pendingOutboxPhotos,
  photoToken,
  scheduleOutboxFailure,
  dataUrlBytes,
  alreadyUploadReady,
  type CheckoutOutboxItem,
} from "./checkout-idempotency.ts";

function sampleItem(overrides: Partial<CheckoutOutboxItem> = {}): CheckoutOutboxItem {
  return {
    id: idempotencyKeyForDraft("cr-company-rad-cab-vehicle-1-check_out-user-driver"),
    draftId: "cr-company-rad-cab-vehicle-1-check_out-user-driver",
    attempts: 0,
    nextAttemptAt: new Date(0).toISOString(),
    createdAt: "2026-10-20T00:00:00.000Z",
    uploadedTokens: {},
    companyId: "company-rad-cab",
    vehicleId: "vehicle-1",
    unitNumber: "11",
    plate: "CYR3806",
    year: 2018,
    make: "Ford",
    model: "Focus",
    odometer: 100,
    driverName: "Driver",
    dispatcherName: "Office",
    type: "check_out",
    signatureDataUrl: "data:image/png;base64,aGk=",
    photos: [
      {
        angle: "front",
        dataUrl: "data:image/jpeg;base64,front-photo",
        capturedAt: "2026-10-20T00:00:00.000Z",
      },
      {
        angle: "rear",
        dataUrl: "data:image/jpeg;base64,rear-photo",
        capturedAt: "2026-10-20T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

test("idempotency keys are stable and safe to store", () => {
  const draftId = "cr-company-rad-cab-veh-check_out-user-driver";
  const key = idempotencyKeyForDraft(draftId);
  assert.equal(key, idempotencyKeyForDraft(draftId));
  assert.match(key, IDEMPOTENCY_KEY_RE);
  assert.notEqual(key, idempotencyKeyForDraft(`${draftId}-other`));
});

test("retries wait longer and a client error stops the loop", () => {
  assert.equal(failureDelay(0, false), 5_000);
  assert.equal(failureDelay(1, false), 15_000);
  assert.equal(failureDelay(4, false), 15 * 60_000);
  assert.equal(failureDelay(9, false), 15 * 60_000);
  assert.equal(isPermanentOutboxError(400, "Missing required checkout fields"), true);
  assert.equal(isPermanentOutboxError(401, "Sign in first. Ask the office to add you."), false);
  assert.equal(isPermanentOutboxError(403, "Sign in first."), false);
  assert.equal(isPermanentOutboxError(503, "unavailable"), false);
  assert.equal(isPermanentOutboxError(undefined, "Failed to fetch"), false);
});

test("uploaded photos are not sent again unless the photo changed", () => {
  const item = sampleItem();
  const front = item.photos[0];
  item.uploadedTokens.front = photoToken(front.dataUrl);
  assert.deepEqual(
    pendingOutboxPhotos(item).map((photo) => photo.angle),
    ["rear"]
  );
  item.photos[0] = { ...front, dataUrl: `${front.dataUrl}-retake` };
  assert.deepEqual(
    pendingOutboxPhotos(item).map((photo) => photo.angle),
    ["front", "rear"]
  );
});

test("a second submit keeps the first server id", () => {
  const first = sampleItem({ serverReportId: "report-1", attempts: 3, permanent: true });
  const second = mergeOutboxAttempt(first, sampleItem({ odometer: 120 }));
  assert.equal(second.serverReportId, "report-1");
  assert.equal(second.odometer, 120);
  assert.equal(second.attempts, 0);
  assert.equal(second.permanent, false);
  assert.equal(second.createdAt, first.createdAt);
});

test("deliver creates once, then only uploads what is left", async () => {
  const created: string[] = [];
  const uploaded: string[] = [];
  let stored = sampleItem();
  const transport = {
    async create(item: CheckoutOutboxItem) {
      created.push(item.id);
      return { id: "report-1" } as never;
    },
    async upload(_reportId: string, photos: { angle: string }[]) {
      uploaded.push(...photos.map((photo) => photo.angle));
      return { id: "report-1" } as never;
    },
  };
  const first = await deliverOutboxItem(stored, transport, async (item) => {
    stored = item;
  });
  assert.equal(first.done, true);
  assert.deepEqual(created, [stored.id]);
  assert.deepEqual(uploaded, ["front", "rear"]);

  stored = {
    ...stored,
    serverReportId: "report-1",
    uploadedTokens: { front: photoToken(stored.photos[0].dataUrl) },
    photos: stored.photos,
  };
  uploaded.length = 0;
  const second = await deliverOutboxItem(stored, transport, async (item) => {
    stored = item;
  });
  assert.equal(second.done, true);
  assert.deepEqual(created, [stored.id]);
  assert.deepEqual(uploaded, ["rear"]);
});

test("a failed create stays queued and does not look finished", async () => {
  const item = sampleItem();
  let stored = item;
  const result = await deliverOutboxItem(
    item,
    {
      async create() {
        const err = new Error("Failed to fetch");
        throw err;
      },
      async upload() {
        throw new Error("should not upload");
      },
    },
    async (next) => {
      stored = next;
    },
    Date.parse("2026-10-20T00:00:00.000Z")
  );
  assert.equal(result.done, false);
  assert.equal(stored.attempts, 1);
  assert.equal(stored.serverReportId, undefined);
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation(new Error("nope")), false);
  const scheduled = scheduleOutboxFailure(item, new Error("nope"), 1_000);
  assert.equal(Date.parse(scheduled.nextAttemptAt) - 1_000, 5_000);
});

test("the same idempotency key cannot insert a second report", async () => {
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
      idempotency_key TEXT,
      sent_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX checkout_reports_org_idempotency_idx
      ON checkout_reports (org_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);
  const data: OrgDb = {
    async query(text, params) {
      const result = await db.query(text, params);
      return result.rows as Record<string, unknown>[];
    },
  };
  await db.exec(`
    INSERT INTO companies (id, name, slug, checklist_id, created_at, org_id)
    VALUES ('fleet-a', 'Fleet A', 'fleet-a', 'generic_30', '2024-01-01', 'org-a');
  `);
  const report = {
    id: "rep-1",
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
    idempotencyKey: "chk-draft-one-abc12345",
  };
  await orgData.upsertReport(data, "org-a", report);
  const found = await orgData.getReportByIdempotency(data, "org-a", report.idempotencyKey);
  assert.equal(found?.id, "rep-1");
  await assert.rejects(
    orgData.upsertReport(data, "org-a", { ...report, id: "rep-2" }),
    (err: unknown) => isUniqueViolation(err)
  );
  const still = await orgData.getReportByIdempotency(data, "org-a", report.idempotencyKey);
  assert.equal(still?.id, "rep-1");
  await orgData.upsertReport(data, "org-a", {
    ...report,
    odometer: 44,
    idempotencyKey: null,
  });
  const updated = await orgData.getReportByIdempotency(data, "org-a", report.idempotencyKey);
  assert.equal(Number(updated?.odometer), 44);
  assert.equal(updated?.idempotency_key, report.idempotencyKey);
});

test("photo byte estimate skips a second compress only for a modest jpeg", () => {
  const jpeg = `data:image/jpeg;base64,${"A".repeat(40)}`;
  assert.equal(dataUrlBytes(jpeg), 30);
  assert.equal(alreadyUploadReady(jpeg), true);
  assert.equal(alreadyUploadReady("data:image/png;base64,AAAA"), false);
  assert.equal(alreadyUploadReady(`data:image/jpeg;base64,${"A".repeat(600_000)}`), false);
});
