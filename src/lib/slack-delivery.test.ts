import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { CheckoutFetch } from "./checkout-slack.ts";
import {
  SLACK_DELIVERY_CAP,
  STALL_PHOTOS_AFTER_MS,
  STALL_REASON_PHOTOS,
  STALL_REASON_UNFINISHED,
  STALL_UNFINISHED_AFTER_MS,
  slackDeliveryExhausted,
  slackPlain,
  slackRetryDelayMs,
  stallReason,
  stallSlackText,
} from "./slack-delivery.ts";
import {
  deliverCheckoutSlack,
  deliverStallSlack,
  runSlackDeliveries,
  slackCronAuth,
} from "./server/slack-delivery.ts";
import { listRadCabStallCandidates, type OrgDb } from "./server/org-data.ts";
import type { CheckoutReport } from "./types.ts";

const ORG = "org-1st-choice-rad-cab";
const RAD = "https://hooks.example.test/radcab";
const ASH = "https://hooks.example.test/ashley";
const STARTED = "2026-10-21T19:40:00.000Z";
const REQUIRED = ["front", "rear"];

const SCHEMA = `
  CREATE TABLE checkout_reports (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    plate TEXT,
    driver_name TEXT NOT NULL,
    dispatcher_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb
  );
  CREATE TABLE slack_deliveries (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    report_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, report_id, kind)
  );
`;

function runner(db: PGlite): OrgDb {
  return {
    async query(text, params) {
      const result = await db.query(text, params);
      return result.rows as Record<string, unknown>[];
    },
  };
}

function report(overrides: Partial<CheckoutReport> = {}): CheckoutReport {
  return {
    id: "cr-sample",
    companyId: "company-rad-cab",
    vehicleId: "vehicle-12",
    unitNumber: "12",
    plate: "RAD12",
    year: 2022,
    make: "Toyota",
    model: "Camry",
    odometer: 145900,
    driverName: "Ada Lovelace",
    dispatcherName: "Pat",
    type: "check_out",
    photos: [],
    status: "complete",
    completedAt: STARTED,
    reviewStatus: "pending",
    flagged: false,
    synced: true,
    createdAt: STARTED,
    ...overrides,
  };
}

function recorder(failures = 0) {
  const calls: string[] = [];
  const texts: string[] = [];
  let left = failures;
  const fetchImpl: CheckoutFetch = async (url, init) => {
    calls.push(url);
    texts.push(String(JSON.parse(init.body).text));
    if (left > 0) {
      left -= 1;
      return { ok: false, status: 429, text: async () => "" };
    }
    return { ok: true, status: 200, text: async () => "ok" };
  };
  return { calls, texts, fetchImpl };
}

const PHOTOS_NOTICE = [
  "*Not sent*",
  "*Unit #:* Unit 12 · RAD12",
  "*Driver:* Ada Lovelace",
  "*Dispatcher:* Pat",
  "*Started:* Oct 21, 2026, 2:40 PM",
  "*Reason:* Photos still uploading",
].join("\n");

test("stall notice is one plain message with unit, driver, dispatcher, start, and reason", () => {
  const text = stallSlackText({
    unitNumber: "12",
    plate: "RAD12",
    driverName: "Ada Lovelace",
    dispatcherName: "Pat",
    startedAt: STARTED,
    reason: STALL_REASON_PHOTOS,
  });
  assert.equal(text, PHOTOS_NOTICE);
  assert.equal(/https?:/i.test(text), false);
  assert.equal(text.includes("/setup/"), false);
  assert.equal(text.toLowerCase().includes("token"), false);
  assert.equal(text.includes(".pdf"), false);
});

test("stall text drops links and setup paths from names", () => {
  const text = stallSlackText({
    unitNumber: "12",
    plate: "RAD12",
    driverName: "Ada https://hooks.example.test/secret /setup/abc?token=secret",
    dispatcherName: "Pat",
    startedAt: STARTED,
    reason: STALL_REASON_UNFINISHED,
  });
  assert.match(text, /\*Driver:\* Ada/);
  assert.equal(/https?:/i.test(text), false);
  assert.equal(text.includes("/setup/"), false);
  assert.equal(text.toLowerCase().includes("token"), false);
  assert.match(text, /\*Reason:\* Unfinished for 30 minutes/);
});

test("slack plain collapses an empty name", () => {
  assert.equal(slackPlain("  "), "—");
});

test("stall reason waits 10 minutes for photos and 30 minutes when photos are stored", () => {
  const created = Date.parse(STARTED);
  const base = {
    createdAt: STARTED,
    photoAngles: [] as string[],
    requiredAngles: REQUIRED,
  };
  assert.equal(stallReason({ ...base, now: created + STALL_PHOTOS_AFTER_MS - 1 }), null);
  assert.equal(
    stallReason({ ...base, now: created + STALL_PHOTOS_AFTER_MS }),
    STALL_REASON_PHOTOS
  );
  assert.equal(
    stallReason({
      ...base,
      photoAngles: REQUIRED,
      now: created + STALL_UNFINISHED_AFTER_MS - 1,
    }),
    null
  );
  assert.equal(
    stallReason({
      ...base,
      photoAngles: REQUIRED,
      now: created + STALL_UNFINISHED_AFTER_MS,
    }),
    STALL_REASON_UNFINISHED
  );
  assert.equal(
    stallReason({ ...base, sentAt: STARTED, now: created + STALL_UNFINISHED_AFTER_MS }),
    null
  );
  assert.equal(
    stallReason({
      ...base,
      archivedAt: STARTED,
      now: created + STALL_UNFINISHED_AFTER_MS,
    }),
    null
  );
  assert.equal(
    stallReason({ ...base, now: created + 8 * 24 * 60 * 60 * 1000 }),
    null
  );
});

test("retry waits 2, 5, 15, 30, then 60 minutes and stops after 6 attempts", () => {
  assert.equal(slackRetryDelayMs(1), 2 * 60 * 1000);
  assert.equal(slackRetryDelayMs(2), 5 * 60 * 1000);
  assert.equal(slackRetryDelayMs(3), 15 * 60 * 1000);
  assert.equal(slackRetryDelayMs(4), 30 * 60 * 1000);
  assert.equal(slackRetryDelayMs(5), 60 * 60 * 1000);
  assert.equal(slackRetryDelayMs(9), 60 * 60 * 1000);
  assert.equal(slackDeliveryExhausted(SLACK_DELIVERY_CAP - 1), false);
  assert.equal(slackDeliveryExhausted(SLACK_DELIVERY_CAP), true);
});

test("cron auth rejects a missing or wrong secret", () => {
  assert.equal(slackCronAuth(null, undefined), "missing");
  assert.equal(slackCronAuth("Bearer nope", "example-secret"), "denied");
  assert.equal(slackCronAuth("Bearer example-secret", "example-secret"), "ok");
});

test("a checkout posts once, retries a failed webhook, and does not post again after success", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const hook = recorder(1);
  const past = Date.now() - 3 * 60 * 60 * 1000;
  const saved = report();
  const first = await deliverCheckoutSlack(org, saved, {
    orgId: ORG,
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    fetchImpl: hook.fetchImpl,
    now: past,
  });
  assert.equal(first, "failed");
  assert.deepEqual(hook.calls, [RAD]);
  const second = await deliverCheckoutSlack(org, saved, {
    orgId: ORG,
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    fetchImpl: hook.fetchImpl,
    now: past,
  });
  assert.equal(second, "sent");
  assert.equal(hook.calls.length, 2);
  const third = await deliverCheckoutSlack(org, saved, {
    orgId: ORG,
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    fetchImpl: hook.fetchImpl,
    now: past,
  });
  assert.equal(third, "skipped");
  assert.equal(hook.calls.length, 2);
  const rows = await org.query(
    `SELECT status, attempts FROM slack_deliveries WHERE org_id = $1 AND report_id = $2 AND kind = 'checkout'`,
    [ORG, saved.id]
  );
  assert.equal(rows[0]?.status, "sent");
  assert.equal(Number(rows[0]?.attempts), 2);
});

test("a missing webhook does not record a delivery", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const status = await deliverCheckoutSlack(org, report({ id: "cr-no-hook" }), {
    orgId: ORG,
    webhooks: {},
    fetchImpl: async () => {
      throw new Error("should not send");
    },
  });
  assert.equal(status, "skipped");
  const rows = await org.query(`SELECT id FROM slack_deliveries`);
  assert.equal(rows.length, 0);
});

test("a DM-only fleet retries the same checkout webhook and still posts once", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const hook = recorder(1);
  const past = Date.now() - 3 * 60 * 60 * 1000;
  const saved = report({
    id: "cr-turo",
    companyId: "company-turo",
    photos: [
      {
        angle: "lf_fender",
        dataUrl: "https://blob.example/lf.jpg",
        capturedAt: STARTED,
        flaggedDamage: true,
        damageNote: "scrape",
      },
    ],
    flagged: true,
  });
  const failed = await deliverCheckoutSlack(org, saved, {
    orgId: ORG,
    route: { mode: "damage_or_fail", destination: "ashley_dm" },
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    fetchImpl: hook.fetchImpl,
    now: past,
  });
  const sent = await deliverCheckoutSlack(org, saved, {
    orgId: ORG,
    route: { mode: "damage_or_fail", destination: "ashley_dm" },
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    fetchImpl: hook.fetchImpl,
    now: past,
  });
  assert.equal(failed, "failed");
  assert.equal(sent, "sent");
  assert.deepEqual(hook.calls, [ASH, ASH]);
  assert.equal(hook.texts[0].includes("blob.example"), false);
  const again = await deliverCheckoutSlack(org, saved, {
    orgId: ORG,
    route: { mode: "damage_or_fail", destination: "ashley_dm" },
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    fetchImpl: hook.fetchImpl,
    now: past,
  });
  assert.equal(again, "skipped");
  assert.equal(hook.calls.length, 2);
});

test("six failed attempts leave the checkout dead and a seventh does not post", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const hook = recorder(SLACK_DELIVERY_CAP);
  const past = Date.now() - 3 * 60 * 60 * 1000;
  const saved = report({ id: "cr-dead" });
  const statuses: string[] = [];
  for (let i = 0; i < SLACK_DELIVERY_CAP; i += 1) {
    statuses.push(
      await deliverCheckoutSlack(org, saved, {
        orgId: ORG,
        webhooks: { radcabcr: RAD },
        fetchImpl: hook.fetchImpl,
        now: past,
      })
    );
  }
  assert.deepEqual(statuses, ["failed", "failed", "failed", "failed", "failed", "dead"]);
  const extra = await deliverCheckoutSlack(org, saved, {
    orgId: ORG,
    webhooks: { radcabcr: RAD },
    fetchImpl: hook.fetchImpl,
    now: past,
  });
  assert.equal(extra, "skipped");
  assert.equal(hook.calls.length, SLACK_DELIVERY_CAP);
});

async function insertReport(
  db: PGlite,
  input: {
    id: string;
    createdAt: string;
    sentAt?: string | null;
    archivedAt?: string | null;
    photos?: Array<{ angle: string }>;
    companyId?: string;
  }
) {
  await db.query(
    `INSERT INTO checkout_reports (
       id, org_id, company_id, unit_number, plate, driver_name, dispatcher_name,
       created_at, sent_at, archived_at, photos
     ) VALUES ($1, $2, $3, '12', 'RAD12', 'Ada Lovelace', 'Pat', $4, $5, $6, $7::jsonb)`,
    [
      input.id,
      ORG,
      input.companyId ?? "company-rad-cab",
      input.createdAt,
      input.sentAt ?? null,
      input.archivedAt ?? null,
      JSON.stringify(input.photos ?? []),
    ]
  );
}

test("stall candidates are stored Rad Cab checks with no notice yet", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const now = Date.parse(STARTED) + 40 * 60 * 1000;
  const newest = new Date(now - STALL_PHOTOS_AFTER_MS).toISOString();
  const oldest = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  await insertReport(db, { id: "cr-photos", createdAt: STARTED });
  await insertReport(db, {
    id: "cr-young",
    createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
  });
  await insertReport(db, { id: "cr-sent", createdAt: STARTED, sentAt: STARTED });
  await insertReport(db, { id: "cr-archived", createdAt: STARTED, archivedAt: STARTED });
  await insertReport(db, { id: "cr-noticed", createdAt: STARTED });
  await db.query(
    `INSERT INTO slack_deliveries (id, org_id, report_id, kind, status, attempts)
     VALUES ('slack-stall-cr-noticed', $1, 'cr-noticed', 'stall', 'sent', 1)`,
    [ORG]
  );
  await insertReport(db, {
    id: "cr-other",
    createdAt: STARTED,
    companyId: "company-turo",
  });
  const rows = await listRadCabStallCandidates(org, {
    orgId: ORG,
    companyId: "company-rad-cab",
    oldest,
    newest,
    limit: 20,
  });
  assert.deepEqual(
    rows.map((row) => row.id),
    ["cr-photos"]
  );
  assert.deepEqual(rows[0]?.photoAngles, []);
});

test("a stalled Rad Cab check posts one notice and a later checkout is separate", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const now = Date.parse(STARTED) + 15 * 60 * 1000;
  await insertReport(db, { id: "cr-stall", createdAt: STARTED });
  const hook = recorder();
  const counts = await runSlackDeliveries(org, {
    orgId: ORG,
    getReport: async () => undefined,
    routes: {},
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    requiredRadCabAngles: REQUIRED,
    fetchImpl: hook.fetchImpl,
    now,
  });
  assert.equal(counts.stalls, 1);
  assert.equal(hook.texts[0], PHOTOS_NOTICE);
  assert.deepEqual(hook.calls, [RAD]);
  const again = await runSlackDeliveries(org, {
    orgId: ORG,
    getReport: async () => undefined,
    routes: {},
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    requiredRadCabAngles: REQUIRED,
    fetchImpl: hook.fetchImpl,
    now,
  });
  assert.equal(again.stalls, 0);
  assert.equal(hook.calls.length, 1);
  const checkout = await deliverCheckoutSlack(
    org,
    report({ id: "cr-stall", sentAt: new Date(now).toISOString() }),
    {
      orgId: ORG,
      webhooks: { radcabcr: RAD, ashleyDm: ASH },
      fetchImpl: hook.fetchImpl,
      now,
    }
  );
  assert.equal(checkout, "sent");
  assert.equal(hook.calls.length, 2);
  assert.match(hook.texts[1], /\*Checkout\*/);
});

test("a failed photo notice retries the same text after the photos arrive", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const now = Date.parse(STARTED) + 15 * 60 * 1000;
  await insertReport(db, { id: "cr-retry-stall", createdAt: STARTED });
  const hook = recorder(1);
  const stored = report({ id: "cr-retry-stall", photos: [] });
  await runSlackDeliveries(org, {
    orgId: ORG,
    getReport: async () => stored,
    routes: {},
    webhooks: { radcabcr: RAD },
    requiredRadCabAngles: REQUIRED,
    fetchImpl: hook.fetchImpl,
    now,
  });
  stored.photos = [
    { angle: "front", dataUrl: "https://blob.example/front.jpg", capturedAt: STARTED },
    { angle: "rear", dataUrl: "https://blob.example/rear.jpg", capturedAt: STARTED },
  ];
  await runSlackDeliveries(org, {
    orgId: ORG,
    getReport: async () => stored,
    routes: {},
    webhooks: { radcabcr: RAD },
    requiredRadCabAngles: REQUIRED,
    fetchImpl: hook.fetchImpl,
    now,
  });
  assert.deepEqual(hook.texts, [PHOTOS_NOTICE, PHOTOS_NOTICE]);
  assert.equal(hook.texts.some((text) => text.includes("Unfinished")), false);
});

test("a failed stall with no saved text is not turned into an early unfinished notice", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const now = Date.parse(STARTED) + 15 * 60 * 1000;
  const saved = report({
    id: "cr-empty-stall",
    photos: [
      { angle: "front", dataUrl: "https://blob.example/front.jpg", capturedAt: STARTED },
      { angle: "rear", dataUrl: "https://blob.example/rear.jpg", capturedAt: STARTED },
    ],
  });
  await db.query(
    `INSERT INTO slack_deliveries (
       id, org_id, report_id, kind, status, attempts, next_attempt_at
     ) VALUES ('slack-stall-cr-empty-stall', $1, $2, 'stall', 'failed', 1, NOW() - INTERVAL '1 minute')`,
    [ORG, saved.id]
  );
  const hook = recorder();
  const counts = await runSlackDeliveries(org, {
    orgId: ORG,
    getReport: async () => saved,
    routes: {},
    webhooks: { radcabcr: RAD },
    requiredRadCabAngles: REQUIRED,
    fetchImpl: hook.fetchImpl,
    now,
  });
  assert.equal(hook.calls.length, 0);
  assert.equal(counts.stalls, 0);
  const rows = await org.query(
    `SELECT status, last_error FROM slack_deliveries WHERE report_id = $1`,
    [saved.id]
  );
  assert.equal(rows[0]?.status, "skipped");
  assert.equal(rows[0]?.last_error, "not stalled");
});

test("a completed check does not get a stall retry", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const saved = report({ id: "cr-done", sentAt: STARTED });
  await db.query(
    `INSERT INTO slack_deliveries (
       id, org_id, report_id, kind, status, attempts, next_attempt_at, body
     ) VALUES (
       'slack-stall-cr-done', $1, $2, 'stall', 'failed', 1, NOW() - INTERVAL '1 minute', $3
     )`,
    [ORG, saved.id, PHOTOS_NOTICE]
  );
  const hook = recorder();
  await runSlackDeliveries(runner(db), {
    orgId: ORG,
    getReport: async () => saved,
    routes: {},
    webhooks: { radcabcr: RAD },
    requiredRadCabAngles: REQUIRED,
    fetchImpl: hook.fetchImpl,
    now: Date.parse(STARTED) + 40 * 60 * 1000,
  });
  assert.equal(hook.calls.length, 0);
  const rows = await db.query(`SELECT status, last_error FROM slack_deliveries WHERE report_id = $1`, [
    saved.id,
  ]);
  assert.equal(String(rows.rows[0]?.status), "skipped");
  assert.equal(String(rows.rows[0]?.last_error), "completed");
});

test("deliverStallSlack skips a check that already completed", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const status = await deliverStallSlack(runner(db), {
    orgId: ORG,
    reportId: "cr-sent",
    text: PHOTOS_NOTICE,
    sentAt: STARTED,
    webhooks: { radcabcr: RAD },
    fetchImpl: async () => {
      throw new Error("should not send");
    },
  });
  assert.equal(status, "skipped");
  const rows = await db.query(`SELECT id FROM slack_deliveries`);
  assert.equal(rows.rows.length, 0);
});
