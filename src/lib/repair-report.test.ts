import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanRepairMentions,
  defaultRepairMentions,
  MARK_CORBETT,
  mentionLine,
  repairReportText,
  repairStatusText,
  slackToMarkdown,
  whoHadItLast,
  whoHadItLastLines,
} from "./repair-report.ts";
import { effectiveRepairMentions, mergeCompanySettings, publicCompanySettings } from "./company-settings.ts";

const RAD = "company-rad-cab";
type P = { angle: string; dataUrl?: string; flaggedDamage?: boolean; damageNote?: string; knownDamageAnswer?: "same" | "new"; knownDamageId?: string };
const check = (id: string, at: string, driverName: string, photos: P[], damage?: Record<string, unknown>) => ({
  id,
  completedAt: at,
  driverName,
  photos: photos as never,
  inspectionForm: (damage ? { damage } : {}) as never,
});
const front = (extra: Partial<P> = {}): P => ({ angle: "front", dataUrl: "blob:x", ...extra });

test("Rad Cab tags Mark Corbett by default; other fleets tag nobody", () => {
  assert.deepEqual(defaultRepairMentions(RAD), [{ id: "U07RCTY13J5", name: "Mark Corbett" }]);
  assert.deepEqual(defaultRepairMentions("company-turo"), []);
});

test("mention line is a real Slack mention, or names only for TEST posts", () => {
  assert.equal(mentionLine([MARK_CORBETT]), "*For:* <@U07RCTY13J5>");
  assert.equal(mentionLine([MARK_CORBETT], true), "*For:* Mark Corbett");
  assert.equal(mentionLine([]), undefined);
});

test("mention list keeps valid Slack member ids only, max 5, no repeats", () => {
  assert.equal(cleanRepairMentions("U07RCTY13J5"), null);
  assert.deepEqual(
    cleanRepairMentions([
      { id: "u07rcty13j5", name: " Mark  Corbett " },
      { id: "U07RCTY13J5", name: "dup" },
      { id: "@mark", name: "bad" },
      { id: "U098Z6J6W4W" },
    ]),
    [
      { id: "U07RCTY13J5", name: "Mark Corbett" },
      { id: "U098Z6J6W4W", name: "U098Z6J6W4W" },
    ]
  );
  const many = Array.from({ length: 8 }, (_, i) => ({ id: `U00000000${i}`, name: `P${i}` }));
  assert.equal(cleanRepairMentions(many)?.length, 5);
});

test("mentions are configurable in settings and default back to Mark", () => {
  assert.deepEqual(publicCompanySettings(null).repairMentions[RAD], [MARK_CORBETT]);
  const doc = mergeCompanySettings(null, { repairMentions: { [RAD]: [MARK_CORBETT, { id: "U098Z6J6W4W", name: "Bell" }] } });
  assert.equal(effectiveRepairMentions(doc)[RAD].length, 2);
  const off = mergeCompanySettings(doc, { repairMentions: { [RAD]: [] } });
  assert.deepEqual(effectiveRepairMentions(off)[RAD], []);
  const back = mergeCompanySettings(off, { repairMentions: { [RAD]: [MARK_CORBETT] } });
  assert.equal(back, null, "default is not stored");
  assert.throws(() => mergeCompanySettings(null, { repairMentions: { [RAD]: "x" as never } }));
});

test("who had it last: found by, last clean check, everyone in between", () => {
  const report = check("now", "2026-11-19T15:00:00Z", "Ken Taylor", [front({ flaggedDamage: true, damageNote: "Bumper damage" })]);
  const history = [
    check("a", "2026-11-04T14:50:00Z", "Chris", [front()]),
    check("b", "2026-11-10T14:00:00Z", "Mike", [front()], { front: "scratch" }),
    check("c", "2026-11-12T14:00:00Z", "Amber", [{ angle: "rear", dataUrl: "x" }]),
    check("d", "2026-11-15T14:00:00Z", "Kyaw", [front({ flaggedDamage: true })]),
    check("later", "2026-11-20T14:00:00Z", "Zed", [front()]),
  ];
  const info = whoHadItLast(report, history);
  assert.equal(info.foundBy.driverName, "Ken Taylor");
  assert.equal(info.lastClean?.reportId, "a");
  assert.deepEqual(info.between.map((c) => c.driverName), ["Mike", "Amber", "Kyaw"]);
  const lines = whoHadItLastLines(info, (id) => `https://x/office/${id}`, (iso) => iso.slice(0, 10));
  assert.equal(lines[0], "*Found by:* <https://x/office/now|2026-11-19 · Ken Taylor>");
  assert.equal(lines[1], "*Last clean check:* <https://x/office/a|2026-11-04 · Chris>");
  assert.equal(lines[3], "• <https://x/office/b|2026-11-10 · Mike>");
});

test("a Same-as-before answer on known damage counts as clean", () => {
  const report = check("now", "2026-11-20T16:00:00Z", "Ken Taylor", [front({ flaggedDamage: true, knownDamageAnswer: "new", knownDamageId: "kd" })]);
  const history = [check("s", "2026-11-19T16:00:00Z", "Amber", [front({ knownDamageAnswer: "same", knownDamageId: "kd" })], { front: "Bumper damage" })];
  const info = whoHadItLast(report, history);
  assert.equal(info.lastClean?.reportId, "s");
  assert.deepEqual(info.between, []);
  assert.ok(whoHadItLastLines(info, (id) => id, (t) => t).includes("• nobody in between"));
});

test("no clean check on record lists the latest checks, capped", () => {
  const report = check("now", "2026-11-30T00:00:00Z", "Ken", [front({ flaggedDamage: true })]);
  const history = Array.from({ length: 14 }, (_, i) =>
    check(`h${i}`, new Date(Date.UTC(2026, 10, 1 + i)).toISOString(), `D${i}`, [{ angle: "rear", dataUrl: "x" }])
  );
  const info = whoHadItLast(report, history, { maxBetween: 10 });
  assert.equal(info.lastClean, undefined);
  assert.equal(info.between.length, 10);
  assert.equal(info.more, 4);
  assert.equal(info.between.at(-1)?.driverName, "D13");
});

test("repair report carries unit, plate, damage, before/after, who, status, link", () => {
  const text = repairReportText({
    kind: "damage",
    unit: "Unit 8",
    plate: "CSL3557",
    vehicle: "2012 Dodge Grand Caravan",
    mention: mentionLine([MARK_CORBETT]),
    damage: ["Front: Bumper damage"],
    beforeAfter: ["*Before / after:*", "• Front: x | After: this check"],
    whoHadIt: ["*Found by:* Ken"],
    status: repairStatusText({ outOfService: null, known: [] }),
    link: { url: "https://app/office/1", label: "Open the check" },
  });
  assert.equal(
    text,
    [
      "*Repair report: New damage* · Unit 8",
      "*For:* <@U07RCTY13J5>",
      "*Vehicle:* 2012 Dodge Grand Caravan · CSL3557",
      "*Damage:*\n• Front: Bumper damage",
      "*Before / after:*",
      "• Front: x | After: this check",
      "*Found by:* Ken",
      "*Status:* In service",
      "<https://app/office/1|Open the check>",
    ].join("\n")
  );
  assert.equal(
    repairStatusText({ outOfService: { by: "Bell", reason: "bumper hanging" }, known: ["Front Scuff"] }),
    "Out of Service (set by Bell · bumper hanging) · known damage: Front Scuff"
  );
});

test("Slack text converts to Markdown for a preview", () => {
  assert.equal(slackToMarkdown("*For:* Mark\n• <https://a/b|Nov 4 · Chris>"), "**For:** Mark\n• [Nov 4 · Chris](https://a/b)");
});

// --- Short post ---------------------------------------------------------------

import {
  damageSummaryItems,
  damageSummaryText,
  mentionText,
  shortDamagePostText,
  shortPacificTime,
  shortUnitLabel,
} from "./repair-report.ts";

test("short post: 3 lines, unit, what's new, who found it, status, link and tag", () => {
  const items = damageSummaryItems({
    photos: [{ angle: "front", flaggedDamage: true }],
    inspectionForm: { damage: { left: "Bumper scrapes", rear: "Bumper scrapes" } } as never,
  });
  const text = shortDamagePostText({
    unitLabel: shortUnitLabel({ unitNumber: "#9", make: "Dodge", model: "GR Caravan" }),
    summary: damageSummaryText(items),
    foundBy: "Ken Taylor",
    foundAt: "2026-11-23T19:49:00Z",
    url: "https://fleet-check-eight.vercel.app/office/abc",
    mention: mentionText([MARK_CORBETT]),
  });
  assert.equal(
    text,
    [
      "*#9 Caravan, new damage:* bumper scrapes (left and rear); damage (front)",
      "Found by Ken Taylor, 11/23 11:49 AM PT · In service",
      "<https://fleet-check-eight.vercel.app/office/abc|Open the check> · <@U07RCTY13J5>",
    ].join("\n")
  );
  assert.ok(!/Before|Had it since|Last clean/.test(text));
  assert.match(shortDamagePostText({ unitLabel: "#5", summary: "x", foundBy: "A", foundAt: "2026-11-23T19:49:00Z", url: "u", outOfService: true }), /· Out of service\n/);
  assert.match(shortDamagePostText({ unitLabel: "#5", summary: "x", foundBy: "A", foundAt: "2026-11-23T19:49:00Z", url: "u", mention: mentionText([MARK_CORBETT], true) }), /· Mark Corbett$/);
});

test("short unit labels", () => {
  assert.equal(shortUnitLabel({ unitNumber: "05", make: "Chrysler", model: "200" }), "#5 Chrysler 200");
  assert.equal(shortUnitLabel({ unitNumber: "#11 Chrysler 200", make: "Chrysler", model: "200" }), "#11 Chrysler 200");
  assert.equal(shortUnitLabel({ unitNumber: "2", make: "Chrysler", model: "Town & Country" }), "#2 Town & Country");
  assert.equal(shortUnitLabel({ unitNumber: "", plate: "CXB9373", make: "Dodge", model: "GR Caravan" }), "CXB9373 Caravan");
  assert.equal(shortPacificTime("2026-11-24T05:15:00Z"), "11/23 9:15 PM PT");
});

test("summary is cut short when long", () => {
  const long = damageSummaryText([{ where: "front", what: "x".repeat(300) }]);
  assert.ok(long.length <= 160 && long.endsWith("…"));
  assert.equal(damageSummaryText([], ["Needs repair"]), "needs repair");
});
