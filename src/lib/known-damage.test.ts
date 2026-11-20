import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  applyKnownDamagePatch,
  cleanKnownDamageInput,
  cleanKnownDamagePatch,
  fixLaterCounts,
  fixLaterList,
  knownDamageFields,
  knownDamageForAngle,
  parseKnownDamageList,
  reviewMarkFor,
  sameAsBeforeAngles,
  spotCheckPicks,
  withoutKnownDamage,
  type KnownDamage,
} from "./known-damage.ts";
import { checkoutAlertKinds } from "./checkout-alert-rules.ts";
import { hasInspectionDamageNotes } from "./inspection-form.ts";
import { reportHasPhotoDamage } from "./photo-flags.ts";
import { alertDamageDetails, alertDetailParts } from "./alert-details.ts";
import { outboxPhoto } from "./checkout-idempotency.ts";
import { driverTallyText, type TallyWindow } from "./driver-tally.ts";
import {
  getVehicleKnownDamage,
  listDriverTallyChecks,
  listSameAsBeforeAnswers,
  listVehiclesWithKnownDamage,
  setVehicleKnownDamage,
  type OrgDb,
} from "./server/org-data.ts";

const kd = (over: Partial<KnownDamage> = {}): KnownDamage => ({
  id: "kd_1",
  vehicleId: "v8",
  angle: "front",
  description: "Bumper damage",
  status: "not_fixing",
  createdAt: "2026-11-19T15:30:00Z",
  createdBy: "Bell",
  ...over,
});

// --- Office marks damage as known ---------------------------------------------

test("mark as known: slot, status, and description are required; date only for Fix later", () => {
  assert.deepEqual(cleanKnownDamageInput({ angle: "nope", status: "fix_later", description: "x" }), {
    error: "Choose the photo slot.",
  });
  assert.deepEqual(cleanKnownDamageInput({ angle: "front", description: "x" }), {
    error: "Choose Known – not fixing or Fix later.",
  });
  assert.deepEqual(cleanKnownDamageInput({ angle: "front", status: "fix_later", description: "  " }), {
    error: "Describe the damage.",
  });
  assert.deepEqual(cleanKnownDamageInput({ angle: "front", status: "fix_later", description: "x", targetDate: "2026-13-01" }), {
    error: "Target date must be a date.",
  });
  assert.deepEqual(
    cleanKnownDamageInput({
      angle: "front",
      status: "fix_later",
      description: "  Bumper   damage ",
      note: "after the holidays",
      targetDate: "2026-12-15",
      sourceReportId: "1795101073102-xawghtk",
    }),
    {
      angle: "front",
      description: "Bumper damage",
      status: "fix_later",
      note: "after the holidays",
      targetDate: "2026-12-15",
      sourceReportId: "1795101073102-xawghtk",
    }
  );
  const notFixing = cleanKnownDamageInput({ angle: "rear", status: "not_fixing", description: "Scuff", targetDate: "2026-12-15" });
  assert.equal("targetDate" in notFixing, false);
});

test("Repaired records who and when; status, note, and date can change", () => {
  assert.deepEqual(cleanKnownDamagePatch({}), { error: "Nothing to change." });
  assert.deepEqual(cleanKnownDamagePatch({ repaired: false }), { error: "repaired can only be true." });
  const patch = cleanKnownDamagePatch({ repaired: true });
  assert.ok(!("error" in patch));
  const done = applyKnownDamagePatch(kd(), patch as never, "Ashley", "2026-11-25T18:00:00Z");
  assert.equal(done.repairedAt, "2026-11-25T18:00:00Z");
  assert.equal(done.repairedBy, "Ashley");
  const moved = applyKnownDamagePatch(kd({ status: "fix_later", targetDate: "2026-12-01" }), { status: "not_fixing" }, "Bell", "t");
  assert.equal(moved.targetDate, undefined, "not fixing has no target date");
});

test("Fix later list: soonest date first, undated last, overdue flagged; repaired drops off", () => {
  const list = [
    kd({ id: "a", status: "fix_later", targetDate: "2026-12-10" }),
    kd({ id: "b", status: "fix_later" }),
    kd({ id: "c", status: "fix_later", targetDate: "2026-11-01" }),
    kd({ id: "d", status: "not_fixing" }),
    kd({ id: "e", status: "fix_later", targetDate: "2026-10-01", repairedAt: "2026-11-02T00:00:00Z" }),
  ];
  const items = fixLaterList(list, "2026-11-20");
  assert.deepEqual(items.map((i) => [i.id, i.overdue]), [["c", true], ["a", false], ["b", false]]);
  assert.deepEqual(fixLaterCounts(list, "2026-11-20"), { fixLater: 3, overdue: 1 });
});

test("the newest active item on a slot is the one drivers are asked about", () => {
  const list = [
    kd({ id: "old", createdAt: "2026-11-01T00:00:00Z" }),
    kd({ id: "new", createdAt: "2026-11-19T00:00:00Z" }),
    kd({ id: "fixed", createdAt: "2026-11-20T00:00:00Z", repairedAt: "2026-11-20T01:00:00Z" }),
  ];
  assert.equal(knownDamageForAngle(list, "front")?.id, "new");
  assert.equal(knownDamageForAngle(list, "rear"), undefined);
});

test("stored lists drop malformed rows", () => {
  assert.deepEqual(parseKnownDamageList("not json", "v8"), []);
  assert.deepEqual(parseKnownDamageList(null, "v8"), []);
  const parsed = parseKnownDamageList(JSON.stringify([kd(), { id: 1 }, { ...kd(), status: "maybe" }]), "v8");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].vehicleId, "v8");
});

// --- Driver answers and alerts --------------------------------------------------

test("only a real answer with an id is stored on the photo", () => {
  assert.deepEqual(knownDamageFields(undefined), {});
  assert.deepEqual(knownDamageFields({ knownDamageId: "kd_1", knownDamageAnswer: "maybe" }), {});
  assert.deepEqual(knownDamageFields({ knownDamageAnswer: "same" }), {});
  assert.deepEqual(
    knownDamageFields({ knownDamageId: "kd_1", knownDamageAnswer: "same", knownDamageAnsweredAt: "2026-11-21T15:00:00Z" }),
    { knownDamageId: "kd_1", knownDamageAnswer: "same", knownDamageAnsweredAt: "2026-11-21T15:00:00.000Z" }
  );
  const queued = outboxPhoto("front", "data:x", "t", {
    flaggedDamage: false,
    knownDamageId: "kd_1",
    knownDamageAnswer: "same",
    knownDamageAnsweredAt: "t2",
  });
  assert.equal(queued.knownDamageAnswer, "same");
  assert.equal(outboxPhoto("front", "data:x", "t", {}).knownDamageId, undefined);
});

function factsFor(report: Parameters<typeof withoutKnownDamage>[0] & { photos: Array<{ angle: string; flaggedDamage?: boolean; dataUrl?: string }> }) {
  const view = withoutKnownDamage(report);
  return checkoutAlertKinds({
    photoDamage: reportHasPhotoDamage(view as never),
    damageNotes: hasInspectionDamageNotes(view.inspectionForm),
  });
}

test("Ken's Unit 8: Same as before on the known front bumper sends no alert", () => {
  const report = {
    photos: [{ angle: "front" as const, knownDamageId: "kd_1", knownDamageAnswer: "same" as const }],
    inspectionForm: { damage: { front: "Bumper damage", marks: ["front"] } } as never,
  };
  assert.deepEqual(factsFor(report), []);
  // Other damage on the same check still alerts.
  const mixed = {
    ...report,
    inspectionForm: { damage: { front: "Bumper damage", rear: "New dent" } } as never,
  };
  assert.deepEqual(factsFor(mixed), ["damage_reported"]);
  assert.deepEqual(alertDetailParts(alertDamageDetails(withoutKnownDamage(mixed))), ["Rear: New dent"]);
});

test("New damage on a known slot alerts as normal", () => {
  const report = {
    photos: [{ angle: "front" as const, flaggedDamage: true, knownDamageId: "kd_1", knownDamageAnswer: "new" as const }],
    inspectionForm: { damage: { front: "Bumper damage" } } as never,
  };
  assert.deepEqual(factsFor(report), ["damage_reported"]);
});

test("checks with no answers alert exactly as before", () => {
  const report = { photos: [{ angle: "front" as const }], inspectionForm: { damage: { front: "Bumper damage" } } as never };
  assert.equal(withoutKnownDamage(report), report);
  assert.deepEqual(factsFor(report), ["damage_reported"]);
});

test("office overruling a Same answer brings the damage back", () => {
  const photos = [
    { angle: "front" as const, knownDamageId: "kd_1", knownDamageAnswer: "same" as const, damageReview: { kind: "missed_damage" as const, by: "Bell", at: "t" } },
  ];
  assert.equal(sameAsBeforeAngles(photos).size, 0);
  assert.deepEqual(factsFor({ photos, inspectionForm: { damage: { front: "Bumper damage" } } as never }), ["damage_reported"]);
});

test("Not new only for a New report, Actually new only for a Same answer", () => {
  assert.equal(reviewMarkFor({ angle: "front", flaggedDamage: true, knownDamageAnswer: "new" }, "not_new"), "false_report");
  assert.equal(reviewMarkFor({ angle: "front", flaggedDamage: true }, "not_new"), "false_report");
  assert.ok("error" in (reviewMarkFor({ angle: "front", knownDamageAnswer: "same" }, "not_new") as object));
  assert.equal(reviewMarkFor({ angle: "front", knownDamageAnswer: "same" }, "actually_new"), "missed_damage");
  assert.ok("error" in (reviewMarkFor({ angle: "front", knownDamageAnswer: "new", flaggedDamage: true }, "actually_new") as object));
});

test("weekly spot check is random but the same all week", () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ key: `r${i}:front` }));
  const a = spotCheckPicks(items, "week-2026-11-16", 5);
  const b = spotCheckPicks([...items].reverse(), "week-2026-11-16", 5);
  assert.equal(a.length, 5);
  assert.deepEqual(a, b);
  assert.notDeepEqual(spotCheckPicks(items, "week-2026-11-23", 5), a);
  assert.deepEqual(spotCheckPicks([], "w", 5), []);
});

test("driver tally adds false reports and missed damage", () => {
  const window: TallyWindow = { kind: "month", key: "m", label: "November", start: "", end: "" };
  const text = driverTallyText(window, [
    { driverName: "Ken Taylor", reviewStatus: "pass", falseReports: 1 },
    { driverName: "Ken Taylor", reviewStatus: "pass", missedDamage: 2 },
    { driverName: "Amber", reviewStatus: "pass" },
  ]);
  assert.match(text ?? "", /Ken Taylor — 2 checks .* · 1 false damage report · 2 missed damage/);
  assert.match(text ?? "", /Amber — 1 check · 1 pass · 0 conditional · 0 fail$/m);
});

// --- Storage (PGlite) -------------------------------------------------------------

function runner(pg: PGlite): OrgDb {
  return { query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[] };
}

test("known damage is saved on the unit, scoped to the org", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE vehicles (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, company_id TEXT, fleet_id TEXT,
      unit_number TEXT, plate TEXT, archived_at TIMESTAMPTZ);
    INSERT INTO vehicles VALUES ('v8', 'org-1', 'rad', NULL, 'Unit 8', 'CSL3557', NULL),
      ('v9', 'org-2', 'x', NULL, 'Unit 9', 'X', NULL);
    ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS known_damage JSONB;
  `);
  const db = runner(pg);
  assert.deepEqual(await getVehicleKnownDamage(db, "org-1", "v8"), []);
  assert.equal(await getVehicleKnownDamage(db, "org-1", "v9"), undefined, "other org's unit is not found");
  assert.equal(await setVehicleKnownDamage(db, "org-1", "v9", [kd()]), false);
  assert.equal(await setVehicleKnownDamage(db, "org-1", "v8", [kd()]), true);
  const stored = await getVehicleKnownDamage(db, "org-1", "v8");
  assert.equal(parseKnownDamageList(stored, "v8")[0].description, "Bumper damage");
  const units = await listVehiclesWithKnownDamage(db, "org-1");
  assert.deepEqual(units.map((u) => u.id), ["v8"]);
  await pg.close();
});

test("tally counts review marks; spot check lists Same answers in the window", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE companies (id TEXT, org_id TEXT, name TEXT);
    CREATE TABLE checkout_reports (
      id TEXT, org_id TEXT, driver_name TEXT, review_status TEXT, company_id TEXT, vehicle_id TEXT,
      unit_number TEXT, plate TEXT, archived_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, photos JSONB
    );
  `);
  const insert = `INSERT INTO checkout_reports VALUES ($1, 'org-1', $2, 'pass', 'rad', 'v8', 'Unit 8', 'CSL3557', NULL, $3, $4::jsonb)`;
  await pg.query(insert, ["a", "Ken Taylor", "2026-11-18T15:00:00Z", JSON.stringify([
    { angle: "front", knownDamageId: "kd_1", knownDamageAnswer: "same", damageReview: { kind: "missed_damage" } },
    { angle: "rear", flaggedDamage: true, damageReview: { kind: "false_report" } },
  ])]);
  await pg.query(insert, ["b", "Amber", "2026-11-19T15:00:00Z", JSON.stringify([{ angle: "front", knownDamageId: "kd_1", knownDamageAnswer: "same" }])]);
  await pg.query(insert, ["c", "Chris", "2026-10-01T15:00:00Z", JSON.stringify([{ angle: "front", knownDamageId: "kd_1", knownDamageAnswer: "same" }])]);
  const db = runner(pg);
  const tally = await listDriverTallyChecks(db, "org-1", "2026-11-16T08:00:00Z", "2026-11-23T08:00:00Z");
  const ken = tally.find((r) => r.driver_name === "Ken Taylor");
  assert.equal(ken?.false_reports, 1);
  assert.equal(ken?.missed_damage, 1);
  const same = await listSameAsBeforeAnswers(db, "org-1", "2026-11-13T00:00:00Z", "2026-11-20T23:00:00Z");
  assert.deepEqual(same.map((r) => [r.report_id, r.angle, r.review_kind]).sort(), [["a", "front", "missed_damage"], ["b", "front", null]]);
  await pg.close();
});
