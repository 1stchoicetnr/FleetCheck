import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  cleanQualityOverride,
  defaultOverrideReason,
  OVERRIDE_REASON_MAX,
  overrideMarker,
  overrideReasonText,
  qualityOverrideCount,
  qualityOverrideFields,
  qualityOverrideSlackLine,
} from "./photo-override.ts";
import {
  deliverOutboxItem,
  idempotencyKeyForDraft,
  outboxPhoto,
  photoBatches,
  type CheckoutOutboxItem,
  type OutboxPhoto,
} from "./checkout-idempotency.ts";
import { driverTallyText, type TallyWindow } from "./driver-tally.ts";
import { toOfficeListReport } from "./office-list.ts";
import { listDriverTallyChecks, type OrgDb } from "./server/org-data.ts";
import type { CheckoutReport } from "./types.ts";

test("only dark, blank, or blurry warnings count as an override", () => {
  assert.equal(cleanQualityOverride("dark"), "dark");
  assert.equal(cleanQualityOverride("blur"), "blur");
  assert.equal(cleanQualityOverride("blank"), "blank");
  assert.equal(cleanQualityOverride("glare"), undefined);
  assert.equal(cleanQualityOverride(""), undefined);
  assert.equal(cleanQualityOverride(undefined), undefined);
  assert.equal(cleanQualityOverride({ issue: "dark" }), undefined);
  assert.equal(defaultOverrideReason("dark"), "Too dark / night");
});

test("the reason is one short line: preset plus optional note", () => {
  assert.equal(overrideReasonText("Too dark / night"), "Too dark / night");
  assert.equal(
    overrideReasonText("Too dark / night", "  parked in\n the garage "),
    "Too dark / night · parked in the garage"
  );
  assert.ok(overrideReasonText("Other", "x".repeat(500)).length <= OVERRIDE_REASON_MAX);
});

test("server keeps only a known override and a trimmed reason", () => {
  assert.deepEqual(qualityOverrideFields(undefined), {});
  assert.deepEqual(qualityOverrideFields({}), {});
  assert.deepEqual(qualityOverrideFields({ qualityOverride: "glare", qualityOverrideReason: "x" }), {});
  assert.deepEqual(qualityOverrideFields({ qualityOverride: "dark" }), { qualityOverride: "dark" });
  assert.deepEqual(
    qualityOverrideFields({ qualityOverride: "blur", qualityOverrideReason: "  shaky   hands " }),
    { qualityOverride: "blur", qualityOverrideReason: "shaky hands" }
  );
  const long = qualityOverrideFields({ qualityOverride: "dark", qualityOverrideReason: "y".repeat(400) });
  assert.equal(long.qualityOverrideReason?.length, OVERRIDE_REASON_MAX);
});

test("office marker and per-check count", () => {
  const photos = [
    { angle: "front", qualityOverride: "dark", qualityOverrideReason: "Too dark / night" },
    { angle: "odometer_fuel", qualityOverride: "blur" },
    { angle: "rear" },
    { angle: "lf_fender", qualityOverride: "nonsense" },
  ];
  assert.equal(qualityOverrideCount(photos), 2);
  assert.equal(qualityOverrideCount(undefined), 0);
  assert.equal(overrideMarker(photos[0]), "Driver kept a dark photo: Too dark / night");
  assert.equal(overrideMarker(photos[1]), "Driver kept a blurry photo");
  assert.equal(overrideMarker(photos[2]), null);
  assert.equal(
    qualityOverrideSlackLine(photos),
    "*:warning: Low-quality photos:* 2 photos kept despite a dark/blurry warning (Front, Odometer & Fuel)."
  );
  assert.equal(qualityOverrideSlackLine([{ angle: "rear" }]), null);
});

function queued(photos: OutboxPhoto[]): CheckoutOutboxItem {
  return {
    id: idempotencyKeyForDraft("cr-test"),
    draftId: "cr-test",
    attempts: 0,
    nextAttemptAt: new Date(0).toISOString(),
    createdAt: "2026-11-18T00:00:00.000Z",
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
    photos,
  };
}

test("the override survives the offline queue and reaches the upload", async () => {
  const at = "2026-11-18T03:00:00.000Z";
  const kept = outboxPhoto("odometer_fuel", "data:image/jpeg;base64,b2Rv", at, {
    flaggedDamage: false,
    qualityOverride: "dark",
    qualityOverrideReason: "Too dark / night",
  });
  // Older drafts have no override fields at all.
  const older = outboxPhoto("front", "data:image/jpeg;base64,ZnJvbnQ=", at, {
    flaggedDamage: false,
  });
  // IndexedDB stores a structured clone; JSON is the stricter round trip.
  const stored: CheckoutOutboxItem = JSON.parse(JSON.stringify(queued([kept, older])));
  assert.equal(photoBatches(stored.photos).flat().length, 2);
  const uploaded: OutboxPhoto[] = [];
  const result = await deliverOutboxItem(
    stored,
    {
      async create() {
        return { id: "report-1" } as never;
      },
      async upload(_id, photos) {
        uploaded.push(...JSON.parse(JSON.stringify(photos)));
        return { id: "report-1" } as never;
      },
    },
    async () => {}
  );
  assert.equal(result.done, true);
  const odo = uploaded.find((photo) => photo.angle === "odometer_fuel");
  const front = uploaded.find((photo) => photo.angle === "front");
  assert.equal(odo?.qualityOverride, "dark");
  assert.equal(odo?.qualityOverrideReason, "Too dark / night");
  assert.equal(front?.qualityOverride, undefined);
  assert.deepEqual(qualityOverrideFields(front), {});
});

test("an older queued check without the field still sends", async () => {
  const legacy = JSON.parse(
    JSON.stringify(
      queued([
        { angle: "front", dataUrl: "data:image/jpeg;base64,ZnJvbnQ=", capturedAt: "2026-11-01T00:00:00.000Z" },
      ])
    )
  ) as CheckoutOutboxItem;
  let sent = 0;
  const result = await deliverOutboxItem(
    legacy,
    {
      async create() {
        return { id: "report-1" } as never;
      },
      async upload(_id, photos) {
        sent += photos.length;
        assert.equal(qualityOverrideCount(photos), 0);
        return { id: "report-1" } as never;
      },
    },
    async () => {}
  );
  assert.equal(result.done, true);
  assert.equal(sent, 1);
});

test("office list rows keep the override marker but not the photo", () => {
  const report = {
    id: "r1",
    photos: [
      {
        angle: "front",
        dataUrl: "https://blob.example/front.jpg",
        capturedAt: "2026-11-18T00:00:00.000Z",
        qualityOverride: "dark",
        qualityOverrideReason: "Too dark / night",
      },
      { angle: "rear", dataUrl: "https://blob.example/rear.jpg", capturedAt: "2026-11-18T00:00:00.000Z" },
    ],
  } as unknown as CheckoutReport;
  const row = toOfficeListReport(report);
  assert.equal(row.photos[0].qualityOverride, "dark");
  assert.equal(row.photos[0].dataUrl, "");
  assert.equal(row.photos[1].qualityOverride, undefined);
  assert.equal(qualityOverrideCount(row.photos), 1);
});

const WEEK: TallyWindow = {
  kind: "week",
  key: "week-2026-11-09",
  label: "Week of Nov 9",
  start: "2026-11-09T08:00:00.000Z",
  end: "2026-11-16T08:00:00.000Z",
};

test("driver tally adds kept low-quality photos per driver", () => {
  const text = driverTallyText(WEEK, [
    { driverName: "Amber", reviewStatus: "pass", qualityOverrides: 2 },
    { driverName: "Amber", reviewStatus: "pass", qualityOverrides: 1 },
    { driverName: "Chris", reviewStatus: "pass" },
  ]);
  assert.match(text ?? "", /Amber — 2 checks · 2 pass · 0 conditional · 0 fail · 3 low-quality photos kept/);
  assert.match(text ?? "", /Chris — 1 check · 1 pass · 0 conditional · 0 fail$/m);
});

function runner(db: PGlite): OrgDb {
  return {
    async query(sql: string, params: unknown[] = []) {
      const result = await db.query(sql, params as never[]);
      return result.rows as Record<string, unknown>[];
    },
  } as OrgDb;
}

test("tally query counts overrides per check, old photos count zero", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE companies (id TEXT, org_id TEXT, name TEXT);
    CREATE TABLE checkout_reports (
      id TEXT, org_id TEXT, driver_name TEXT, review_status TEXT, company_id TEXT,
      archived_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, photos JSONB
    );
  `);
  const insert = `INSERT INTO checkout_reports VALUES ($1, 'org-1', $2, 'pass', NULL, NULL, '2026-11-10T00:00:00Z', $3::jsonb)`;
  await pg.query(insert, [
    "a",
    "Amber",
    JSON.stringify([
      { angle: "front", qualityOverride: "dark" },
      { angle: "rear", qualityOverride: "blur" },
      { angle: "odometer_fuel", qualityOverride: "glare" },
    ]),
  ]);
  await pg.query(insert, ["b", "Chris", JSON.stringify([{ angle: "front" }])]);
  await pg.query(insert, ["c", "Bell", null]);
  const rows = await listDriverTallyChecks(runner(pg), "org-1", WEEK.start, WEEK.end);
  const byDriver = Object.fromEntries(rows.map((row) => [row.driver_name, row.quality_overrides]));
  assert.deepEqual(byDriver, { Amber: 2, Chris: 0, Bell: 0 });
  await pg.close();
});
