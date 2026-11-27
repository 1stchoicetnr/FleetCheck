import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { MARK_CORBETT, mentionText } from "./repair-report.ts";
import {
  claimRepairDigestItems,
  enqueueRepairDigestItem,
  type OrgDb,
} from "./server/org-data.ts";
import {
  deliverRadCabDamage,
  groupDigestItems,
  pacificHour,
  repairDigestItemFromReport,
  repairDigestText,
  repairNoticePlan,
  sendDueRepairDigest,
  shouldSendRepairDigest,
  type RepairDigestItem,
} from "./repair-digest.ts";

const RAD = "company-rad-cab";
const ORIGIN = "https://app.example";
const MENTION = mentionText([MARK_CORBETT]);

function line(over: Partial<RepairDigestItem> & Pick<RepairDigestItem, "vehicleId" | "reportId" | "foundAt">): RepairDigestItem {
  return {
    id: over.id ?? over.reportId,
    orgId: "org-1",
    companyId: RAD,
    unitLabel: "#9 Caravan",
    summary: "bumper damage",
    foundBy: "Ken Taylor",
    createdAt: over.foundAt,
    ...over,
  };
}

test("digest groups by unit and tags Mark once", () => {
  const items = [
    line({
      vehicleId: "v5",
      unitLabel: "#5 Chrysler 200",
      summary: "rear bumper damage",
      foundBy: "Amber",
      foundAt: "2026-11-24T21:15:00Z",
      reportId: "c",
    }),
    line({
      vehicleId: "v9",
      unitLabel: "#9 Caravan",
      summary: "bumper scrapes (front)",
      foundBy: "Ken Taylor",
      foundAt: "2026-11-23T19:49:00Z",
      reportId: "a",
    }),
    line({
      vehicleId: "v9",
      unitLabel: "#9 Caravan",
      summary: "door dent (left)",
      foundBy: "Mike",
      foundAt: "2026-11-24T17:02:00Z",
      reportId: "b",
    }),
  ];
  const groups = groupDigestItems(items);
  assert.deepEqual(groups.map((g) => g.vehicleId), ["v9", "v5"]);
  assert.deepEqual(groups[0].items.map((item) => item.reportId), ["a", "b"]);
  const text = repairDigestText(items, { origin: ORIGIN, mention: MENTION });
  assert.equal(
    text,
    [
      "*Rad Cab damage digest* · <@U07RCTY13J5>",
      "",
      "*#9 Caravan*",
      "bumper scrapes (front)",
      "Found by Ken Taylor, 11/23 11:49 AM PT · <https://app.example/office/a|Open the check>",
      "door dent (left)",
      "Found by Mike, 11/24 9:02 AM PT · <https://app.example/office/b|Open the check>",
      "",
      "*#5 Chrysler 200*",
      "rear bumper damage",
      "Found by Amber, 11/24 1:15 PM PT · <https://app.example/office/c|Open the check>",
    ].join("\n")
  );
  assert.equal(text.match(/<@U07RCTY13J5>/g)?.length, 1);
  assert.equal(repairDigestText([], { origin: ORIGIN, mention: MENTION }), "");
});

test("1 PM Pacific is 21:00 UTC in winter and 20:00 UTC in summer", () => {
  const cases: Array<[string, boolean]> = [
    ["2026-01-15T21:00:00Z", true],
    ["2026-01-15T20:00:00Z", false],
    ["2026-01-15T21:30:00Z", true],
    ["2026-07-15T20:00:00Z", true],
    ["2026-07-15T21:00:00Z", false],
    ["2026-03-08T20:00:00Z", true],
    ["2026-03-08T21:00:00Z", false],
    ["2026-11-01T20:00:00Z", false],
    ["2026-11-01T21:00:00Z", true],
    ["2026-11-27T21:00:00Z", true],
    ["2026-11-27T20:00:00Z", false],
  ];
  for (const [iso, send] of cases) {
    const now = new Date(iso);
    assert.equal(shouldSendRepairDigest(now), send, iso);
    assert.equal(pacificHour(now), send ? 13 : pacificHour(now));
  }
  assert.equal(pacificHour(new Date("2026-01-15T20:00:00Z")), 12);
  assert.equal(pacificHour(new Date("2026-07-15T21:00:00Z")), 14);
});

test("nothing is posted when the queue is empty or it is not 1 PM", async () => {
  const posts: string[] = [];
  let claims = 0;
  const noon = await sendDueRepairDigest({
    now: new Date("2026-01-15T20:00:00Z"),
    origin: ORIGIN,
    mention: MENTION,
    claim: async () => {
      claims += 1;
      return [line({ vehicleId: "v9", reportId: "a", foundAt: "2026-01-15T18:00:00Z" })];
    },
    post: async (text) => void posts.push(text),
  });
  assert.equal(noon.reason, "not-1pm");
  assert.equal(claims, 0);
  const empty = await sendDueRepairDigest({
    now: new Date("2026-01-15T21:00:00Z"),
    origin: ORIGIN,
    mention: MENTION,
    claim: async () => [],
    post: async (text) => void posts.push(text),
  });
  assert.equal(empty.reason, "empty");
  assert.equal(posts.length, 0);
});

test("a second run does not post the same items again", async () => {
  const rows = [
    line({ vehicleId: "v9", reportId: "a", foundAt: "2026-01-15T18:00:00Z", summary: "bumper crack (front)" }),
    line({ vehicleId: "v8", unitLabel: "#8 Caravan", reportId: "b", foundAt: "2026-01-15T19:00:00Z", summary: "door dent (left)" }),
  ];
  const posts: string[] = [];
  const claim = async (key: string, at: string) => {
    const taken = rows.filter((row) => !row.digestedAt);
    for (const row of taken) {
      row.digestedAt = at;
      row.digestKey = key;
    }
    return taken;
  };
  const now = new Date("2026-07-15T20:00:00Z");
  const first = await sendDueRepairDigest({
    now,
    origin: ORIGIN,
    mention: MENTION,
    claim,
    post: async (text) => void posts.push(text),
  });
  const second = await sendDueRepairDigest({
    now,
    origin: ORIGIN,
    mention: MENTION,
    claim,
    post: async (text) => void posts.push(text),
  });
  assert.equal(first.reason, "sent");
  assert.equal(first.count, 2);
  assert.equal(second.reason, "empty");
  assert.equal(posts.length, 1);
  assert.match(posts[0], /\*#9 Caravan\*/);
  assert.match(posts[0], /\*#8 Caravan\*/);
  assert.equal(posts[0].match(/<@U07RCTY13J5>/g)?.length, 1);
});

test("Rad Cab damage is queued; out of service still posts immediately", async () => {
  assert.equal(repairNoticePlan(RAD, "damage"), "digest");
  assert.equal(repairNoticePlan(RAD, "out_of_service"), "immediate");
  assert.equal(repairNoticePlan("company-turo", "damage"), "skip");
  assert.equal(repairNoticePlan("company-turo", "out_of_service"), "skip");

  const calls: string[] = [];
  assert.equal(
    await deliverRadCabDamage({
      companyId: RAD,
      kind: "damage",
      enqueue: async () => void calls.push("queue"),
      postNow: async () => void calls.push("post"),
    }),
    "queued"
  );
  assert.equal(
    await deliverRadCabDamage({
      companyId: RAD,
      kind: "out_of_service",
      enqueue: async () => void calls.push("queue"),
      postNow: async () => void calls.push("post"),
    }),
    "posted"
  );
  assert.deepEqual(calls, ["queue", "post"]);
  assert.equal(
    await deliverRadCabDamage({
      companyId: "company-turo",
      kind: "damage",
      enqueue: async () => void calls.push("queue"),
      postNow: async () => void calls.push("post"),
    }),
    "skipped"
  );

  const src = readFileSync(new URL("./server/report-alerts.ts", import.meta.url), "utf8");
  const start = src.indexOf("export async function recordVehicleOutOfService");
  const end = src.indexOf("export async function buildOutOfServiceRepairReport");
  const body = src.slice(start, end);
  assert.match(body, /postRepairText\(/);
  assert.doesNotMatch(body, /enqueueDamageDigest|deliverRadCabDamage/);
});

test("a queued item keeps the short damage summary", () => {
  const item = repairDigestItemFromReport(
    {
      id: "r1",
      companyId: RAD,
      vehicleId: "v9",
      unitNumber: "#9",
      make: "Dodge",
      model: "GR Caravan",
      driverName: "Ken Taylor",
      completedAt: "2026-11-23T19:49:00Z",
      photos: [{ angle: "front", flaggedDamage: true, damageNote: "Bumper scrapes" }],
      inspectionForm: { damage: { rear: "Bumper scrapes" } } as never,
    },
    ["r1:damage_reported"]
  );
  assert.equal(item.id, "digest:r1:damage_reported");
  assert.equal(item.unitLabel, "#9 Caravan");
  assert.match(item.summary, /bumper scrapes/);
  assert.equal(item.foundBy, "Ken Taylor");
});

function runner(pg: PGlite): OrgDb {
  return { query: async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[] };
}

test("claimed digest rows are not returned again", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE repair_digest_items (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      report_id TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      unit_label TEXT NOT NULL,
      summary TEXT NOT NULL,
      found_by TEXT NOT NULL,
      found_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      digested_at TIMESTAMPTZ,
      digest_key TEXT
    );
  `);
  const db = runner(pg);
  const item = (id: string, vehicleId: string): RepairDigestItem => ({
    id,
    orgId: "org-1",
    companyId: RAD,
    reportId: id,
    vehicleId,
    unitLabel: vehicleId,
    summary: "bumper damage",
    foundBy: "Ken",
    foundAt: "2026-01-15T18:00:00Z",
    createdAt: "2026-01-15T18:00:00Z",
  });
  await enqueueRepairDigestItem(db, item("a", "v9"));
  await enqueueRepairDigestItem(db, item("a", "v9"));
  await enqueueRepairDigestItem(db, { ...item("b", "v8"), orgId: "org-2" });
  const posts: string[] = [];
  const claim = async (key: string, at: string) => {
    const rows = await claimRepairDigestItems(db, "org-1", key, at);
    return rows.map((row) => ({
      id: String(row.id),
      vehicleId: String(row.vehicle_id),
      unitLabel: String(row.unit_label),
      summary: String(row.summary),
      foundBy: String(row.found_by),
      foundAt: new Date(String(row.found_at)).toISOString(),
      reportId: String(row.report_id),
    }));
  };
  const now = new Date("2026-01-15T21:00:00Z");
  const first = await sendDueRepairDigest({
    now,
    origin: ORIGIN,
    mention: MENTION,
    claim,
    post: async (text) => void posts.push(text),
  });
  const second = await sendDueRepairDigest({
    now,
    origin: ORIGIN,
    mention: MENTION,
    claim,
    post: async (text) => void posts.push(text),
  });
  assert.equal(first.count, 1);
  assert.equal(second.reason, "empty");
  assert.equal(posts.length, 1);
  const left = await pg.query("SELECT id, digested_at FROM repair_digest_items ORDER BY id");
  assert.equal(left.rows.length, 2);
  assert.ok(left.rows[0].digested_at, "org-1 row is marked");
  assert.equal(left.rows[1].digested_at, null, "another org is left queued");
  const empty = await sendDueRepairDigest({
    now,
    origin: ORIGIN,
    mention: MENTION,
    claim: async () => [],
    post: async (text) => void posts.push(text),
  });
  assert.equal(empty.reason, "empty");
  assert.equal(posts.length, 1);
  await pg.close();
});
