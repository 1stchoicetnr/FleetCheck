import assert from "node:assert/strict";
import test from "node:test";
import {
  damageDescriptionsMatch,
  damageSlotsOnCheck,
  onFileDamage,
  parseReportedDamageId,
  reportedDamageId,
  reportedDamagePrompts,
  splitNewDamage,
  type OnFileCheck,
} from "./on-file-damage.ts";
import type { KnownDamage } from "./known-damage.ts";
import { checkoutAlertKinds } from "./checkout-alert-rules.ts";
import { hasInspectionDamageNotes } from "./inspection-form.ts";
import { reportHasPhotoDamage } from "./photo-flags.ts";
import type { CheckoutInspectionForm } from "./inspection-form.ts";

type Photo = OnFileCheck["photos"][number];

function check(
  id: string,
  completedAt: string,
  driverName: string,
  damage: Record<string, string> = {},
  photos: Photo[] = []
): OnFileCheck {
  return {
    id,
    completedAt,
    driverName,
    photos,
    inspectionForm: { damage } as unknown as CheckoutInspectionForm,
  };
}

const alertKinds = (r: OnFileCheck) =>
  checkoutAlertKinds({
    needsRepair: false,
    safety: false,
    refuseToDrive: false,
    outOfService: false,
    photoDamage: reportHasPhotoDamage(r as never),
    damageNotes: hasInspectionDamageNotes(r.inspectionForm ?? undefined),
  });

const kd = (over: Partial<KnownDamage> = {}): KnownDamage => ({
  id: "kd_1",
  vehicleId: "v9",
  angle: "front",
  description: "Bumper damage",
  status: "not_fixing",
  createdAt: "2026-11-01T15:00:00Z",
  createdBy: "Bell",
  ...over,
});

// Unit #9, 11/23-11/24: the same bumper scrapes, worded differently each time.
const n9 = [
  check("c738", "2026-11-23T15:38:00Z", "Ken Taylor", { front: "Bumper scraped", rear: "Bumper scrapedb" }),
  check("c1149", "2026-11-23T19:49:00Z", "Ken Taylor", { front: "Scrapes bumper", rear: "Scrapes bumper" }),
  check("c2115", "2026-11-24T05:15:00Z", "Mike Snyder", { front: "Bumper damage", rear: "Bumper damage" }),
];

test("#9: only the first bumper report is new; later sightings stay on the check without a post", () => {
  const first = splitNewDamage(n9[0], onFileDamage([], [], n9[0].completedAt));
  assert.equal(first.repeats.length, 0);
  assert.deepEqual(alertKinds(first.report), ["damage_reported"]);
  for (let i = 1; i < n9.length; i += 1) {
    const split = splitNewDamage(n9[i], onFileDamage(n9.slice(0, i), [], n9[i].completedAt));
    assert.deepEqual(split.repeats.map((r) => r.angle).sort(), ["front", "rear"]);
    assert.equal(split.repeats[0].onFile.source, "reported");
    assert.equal(split.repeats[0].onFile.firstReportedBy, "Ken Taylor");
    assert.deepEqual(alertKinds(split.report), [], `check ${n9[i].id} should not post`);
  }
  const front = onFileDamage(n9, [], "2026-11-24T18:00:00Z").find((i) => i.angle === "front");
  assert.equal(front?.sightings, 3);
  assert.equal(front?.id, reportedDamageId("c738", "front"));
});

test("#2 left front crease: dent / fender words match the earlier report on the same slot", () => {
  const earlier = check("a", "2026-11-22T23:17:00Z", "Joe", { left: "Front fender debt" });
  const now = check("b", "2026-11-23T20:00:00Z", "Amber", { left: "Front quarter dent" });
  const split = splitNewDamage(now, onFileDamage([earlier], [], now.completedAt));
  assert.equal(split.repeats.length, 1);
  assert.deepEqual(alertKinds(split.report), []);
});

test("known damage (office marked) matches without the driver's answer, too", () => {
  const now = check("x", "2026-11-23T20:00:00Z", "Ken", { front: "Bumper damage" });
  const split = splitNewDamage(now, onFileDamage([], [kd()], now.completedAt));
  assert.equal(split.repeats[0].onFile.source, "known");
  assert.deepEqual(alertKinds(split.report), []);
});

test("genuinely new damage still alerts: different slot, different kind next to old damage, or driver said New", () => {
  const prior = check("p", "2026-11-23T15:00:00Z", "Ken", { front: "Bumper scrapes" });
  const onFile = onFileDamage([prior], [], "2026-11-23T20:00:00Z");
  // Different slot.
  const side = splitNewDamage(check("s", "2026-11-23T20:00:00Z", "Ken", { front: "Bumper scrapes", left: "Door dent" }), onFile);
  assert.deepEqual(side.newSlots.map((s) => s.angle), ["driver_doors"]);
  assert.deepEqual(alertKinds(side.report), ["damage_reported"]);
  // Same slot, a dent next to the old scrapes.
  const dent = splitNewDamage(check("d", "2026-11-23T20:00:00Z", "Ken", { front: "Bumper dent" }), onFile);
  assert.equal(dent.repeats.length, 0);
  // Words that say it is new.
  const worse = splitNewDamage(check("w", "2026-11-23T20:00:00Z", "Ken", { front: "New bumper scrapes" }), onFile);
  assert.equal(worse.repeats.length, 0);
  // Driver answered New damage on the slot.
  const said = splitNewDamage(
    check("n", "2026-11-23T20:00:00Z", "Ken", { front: "Bumper scrapes" }, [
      { angle: "front", flaggedDamage: true, knownDamageId: reportedDamageId("p", "front"), knownDamageAnswer: "new" },
    ]),
    onFile
  );
  assert.equal(said.repeats.length, 0);
  assert.deepEqual(alertKinds(said.report), ["damage_reported"]);
});

test("Repaired clears it: damage reported after the repair is new again", () => {
  const prior = check("p", "2026-11-20T15:00:00Z", "Ken", { rear: "Bumper damage" });
  const repaired = kd({ id: "kd_r", angle: "rear", sourceReportId: "p", repairedAt: "2026-11-21T18:00:00Z", repairedBy: "Mark" });
  const now = check("n", "2026-11-23T15:00:00Z", "Ken", { rear: "Bumper damage" });
  assert.equal(onFileDamage([prior], [repaired], now.completedAt).length, 0);
  assert.equal(splitNewDamage(now, onFileDamage([prior], [repaired], now.completedAt)).repeats.length, 0);
  // Before the repair it was on file.
  assert.equal(onFileDamage([prior], [repaired], "2026-11-21T12:00:00Z").length, 1);
});

test("office 'Not new' (false report) does not put damage on file", () => {
  const prior = check("p", "2026-11-20T15:00:00Z", "Ken", {}, [
    { angle: "front", flaggedDamage: true, damageNote: "Bumper scrapes", damageReview: { kind: "false_report", by: "Bell", at: "2026-11-20T16:00:00Z" } },
  ]);
  assert.equal(onFileDamage([prior], [], "2026-11-21T00:00:00Z").length, 0);
});

test("Same as before on reported damage counts as a sighting and stays quiet", () => {
  const prior = check("p", "2026-11-20T15:00:00Z", "Ken", { rear: "Bumper damage" });
  const same = check("s", "2026-11-21T15:00:00Z", "Bonnie", { rear: "Bumper damage" }, [
    { angle: "rear", flaggedDamage: false, knownDamageId: reportedDamageId("p", "rear"), knownDamageAnswer: "same" },
  ]);
  assert.deepEqual(damageSlotsOnCheck(same), []);
  const item = onFileDamage([prior, same], [], "2026-11-22T00:00:00Z")[0];
  assert.equal(item.sightings, 2);
  assert.equal(item.lastSeenBy, "Bonnie");
});

test("phone prompts and reported ids", () => {
  assert.deepEqual(parseReportedDamageId(reportedDamageId("1795463374725-yyw82og", "front")), {
    reportId: "1795463374725-yyw82og",
    angle: "front",
  });
  assert.equal(parseReportedDamageId("kd_123"), null);
  const prompts = reportedDamagePrompts(onFileDamage(n9, [], "2026-11-24T18:00:00Z"), () => "Nov 23");
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].reported, true);
  assert.equal(prompts[0].note, "Reported Nov 23 by Ken Taylor · seen on 3 checks");
});

test("description matching is conservative", () => {
  assert.equal(damageDescriptionsMatch("Bumper damage", "Scrapes bumper"), true);
  assert.equal(damageDescriptionsMatch("Bumper dent", "Bumper scrapes"), false);
  assert.equal(damageDescriptionsMatch("Rear door dent", "Front door dent"), false);
  assert.equal(damageDescriptionsMatch("Hood scratch", "Bumper scratch"), false);
  assert.equal(damageDescriptionsMatch("Another bumper scrape", "Bumper scrapes"), false);
});

test("office marks a report as known with its own words: that report and later ones in the driver's words still match", () => {
  const first = check("f", "2026-11-20T15:00:00Z", "Ken", { rear: "Bumper scrapes" });
  const known = kd({ id: "kd_x", angle: "rear", description: "Rear bumper rash, not fixing", sourceReportId: "f", createdAt: "2026-11-20T17:00:00Z" });
  const now = check("n", "2026-11-22T15:00:00Z", "Mike", { rear: "Scraped bumper" });
  const onFile = onFileDamage([first], [known], now.completedAt);
  assert.equal(onFile.length, 1);
  assert.equal(onFile[0].source, "known");
  assert.equal(splitNewDamage(now, onFile).repeats.length, 1);
});
