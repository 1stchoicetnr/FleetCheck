import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { deliverCheckoutSlack } from "./server/slack-delivery.ts";
import type { OrgDb } from "./server/org-data.ts";
import {
  checkoutThreadFilePlan,
  pendingThreadFiles,
  slackPhotoCaption,
  threadUploadBatches,
} from "./slack-files.ts";
import type { SlackBinaryFile, SlackHttp } from "./slack-upload.ts";
import { PHOTO_ANGLES, type CheckoutReport, type PhotoAngle } from "./types.ts";

const ORG = "org-1st-choice-rad-cab";
const CHANNEL = "C0BABDEGGKY";
const TOKEN = "xoxb-test-token";
const RAD = "https://hooks.example.test/radcab";
const ASH = "https://hooks.example.test/ashley";

const SCHEMA = `
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
    id: "cr-files",
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
    completedAt: "2026-10-21T19:40:00.000Z",
    reviewStatus: "pending",
    flagged: false,
    synced: true,
    createdAt: "2026-10-21T19:40:00.000Z",
    ...overrides,
  };
}

function photo(angle: PhotoAngle, flagged = false): CheckoutReport["photos"][number] {
  return {
    angle,
    dataUrl: `https://blob.example/${angle}.jpg`,
    capturedAt: "2026-10-21T19:40:00.000Z",
    flaggedDamage: flagged,
    damageNote: flagged ? "scrape" : undefined,
  };
}

test("thread files stay in walkaround order with the PDF first and damage marked", () => {
  const steps = PHOTO_ANGLES.slice(0, 4);
  const saved = report({
    photos: [...steps].reverse().map((step, index) => photo(step.angle, index === 0)),
  });
  const plan = checkoutThreadFilePlan(saved, steps);
  assert.deepEqual(
    plan.map((file) => file.key),
    ["pdf", ...steps.map((step) => step.angle)]
  );
  assert.equal(plan[0]?.title, "Checkout PDF");
  assert.equal(plan[0]?.filename, "checkout-12.pdf");
  const flagged = saved.photos.find((item) => item.flaggedDamage);
  assert.ok(flagged);
  assert.equal(slackPhotoCaption(flagged), `${plan.find((file) => file.key === flagged.angle)?.title}`);
  assert.match(slackPhotoCaption(flagged), / · DAMAGE$/);
  assert.equal(plan.some((file) => /https?:/i.test(file.title)), false);
  const nine = PHOTO_ANGLES.slice(0, 9).map((step) => photo(step.angle));
  const batches = threadUploadBatches(
    pendingThreadFiles(checkoutThreadFilePlan(report({ photos: nine }), PHOTO_ANGLES.slice(0, 9)), {
      done: [],
    })
  );
  assert.equal(batches[0]?.map((file) => file.key).join(","), "pdf");
  assert.equal(batches[1]?.length, 8);
  assert.equal(batches[2]?.length, 1);
  assert.deepEqual(
    batches.slice(1).flat().map((file) => file.key),
    nine.map((item) => item.angle)
  );
});

type Call = { url: string; body: string; headers: Record<string, string> };

function slackMock(options?: { failPdfCompletes?: number }) {
  const calls: Call[] = [];
  let pdfFails = options?.failPdfCompletes ?? 0;
  const slackFetch: SlackHttp = async (url, init) => {
    const body =
      typeof init.body === "string" ? init.body : `bytes:${init.body?.byteLength ?? 0}`;
    calls.push({ url, body, headers: init.headers });
    if (url.endsWith("/conversations.join")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    }
    if (url.endsWith("/chat.postMessage")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, ts: "1700000000.000100", channel: CHANNEL }),
      };
    }
    if (url.endsWith("/files.getUploadURLExternal")) {
      const name = new URLSearchParams(body).get("filename") || "file";
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            upload_url: `https://files.slack.com/upload/${encodeURIComponent(name)}`,
            file_id: `F-${name}`,
          }),
      };
    }
    if (url.includes("files.slack.com/upload/")) {
      return { ok: true, status: 200, text: async () => "OK" };
    }
    if (url.endsWith("/files.completeUploadExternal")) {
      if (pdfFails > 0 && body.includes("Checkout PDF")) {
        pdfFails -= 1;
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: "ratelimited" }) };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, files: [] }) };
    }
    return { ok: false, status: 500, text: async () => "unexpected" };
  };
  return { calls, slackFetch };
}

function binaries(keys: string[]): SlackBinaryFile[] {
  return keys.map((key) => ({
    key,
    filename: key === "pdf" ? "checkout-12.pdf" : `${key}.jpg`,
    title: key === "pdf" ? "Checkout PDF" : key,
    bytes: Uint8Array.from([1, 2, 3]),
    contentType: key === "pdf" ? "application/pdf" : "image/jpeg",
  }));
}

test("Rad Cab posts one message and then the PDF and photos in its thread", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const org = runner(db);
  const hook = slackMock({ failPdfCompletes: 1 });
  const saved = report({
    photos: [
      photo("lf_fender", true),
      photo("windshield"),
      photo("odometer_fuel"),
    ],
  });
  const past = Date.now() - 3 * 60 * 60 * 1000;
  const options = {
    orgId: ORG,
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    slackApi: { token: TOKEN, channelId: CHANNEL },
    slackFetch: hook.slackFetch,
    loadThreadFiles: async (_report: CheckoutReport, keys: string[]) => binaries(keys),
    now: past,
  };
  const failed = await deliverCheckoutSlack(org, saved, options);
  assert.equal(failed, "failed");
  const sent = await deliverCheckoutSlack(org, saved, options);
  assert.equal(sent, "sent");
  const again = await deliverCheckoutSlack(org, saved, options);
  assert.equal(again, "skipped");

  const messages = hook.calls.filter((call) => call.url.endsWith("/chat.postMessage"));
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.headers.Authorization, `Bearer ${TOKEN}`);
  const parent = JSON.parse(messages[0]?.body || "{}") as { text?: string; channel?: string; thread_ts?: string };
  assert.equal(parent.channel, CHANNEL);
  assert.equal(parent.thread_ts, undefined);
  assert.match(parent.text || "", /\*PDF:\*/);
  assert.match(parent.text || "", /\*Photos:\*/);
  assert.equal((parent.text || "").includes("blob.example"), false);
  assert.equal((parent.text || "").length <= 2500, true);
  assert.equal(hook.calls.some((call) => call.url === RAD || call.url === ASH), false);

  const completes = hook.calls.filter((call) => call.url.endsWith("/files.completeUploadExternal"));
  const comments = completes.map((call) => {
    const payload = JSON.parse(call.body) as { thread_ts?: string; channel_id?: string; initial_comment?: string };
    assert.equal(payload.thread_ts, "1700000000.000100");
    assert.equal(payload.channel_id, CHANNEL);
    return payload.initial_comment;
  });
  assert.deepEqual(comments, [
    "Checkout PDF",
    "Checkout PDF",
    "Odometer & Fuel\nWindshield\nLF Fender · DAMAGE",
  ]);
  const rows = await org.query(
    `SELECT status, attempts FROM slack_deliveries WHERE report_id = $1 AND kind = 'checkout'`,
    [saved.id]
  );
  assert.equal(rows[0]?.status, "sent");
  assert.equal(Number(rows[0]?.attempts), 2);
});

test("a bot that is not in the channel posts the checkout text by webhook once", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const calls: string[] = [];
  const slackFetch: SlackHttp = async (url) => {
    calls.push(url);
    if (url.endsWith("/conversations.join")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: "missing_scope" }) };
    }
    if (url.endsWith("/chat.postMessage")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: false, error: "not_in_channel" }) };
    }
    return { ok: false, status: 500, text: async () => "unexpected" };
  };
  const status = await deliverCheckoutSlack(runner(db), report({ id: "cr-join" }), {
    orgId: ORG,
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    slackApi: { token: TOKEN, channelId: CHANNEL },
    slackFetch,
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => "ok" };
    },
    loadThreadFiles: async () => {
      throw new Error("files should wait until the bot can post");
    },
  });
  assert.equal(status, "sent");
  assert.equal(calls.filter((url) => url.endsWith("/chat.postMessage")).length, 1);
  assert.equal(calls.filter((url) => url === RAD).length, 1);
  assert.equal(calls.includes(ASH), false);
  const rows = await runner(db).query(
    `SELECT status, last_error FROM slack_deliveries WHERE report_id = $1`,
    ["cr-join"]
  );
  assert.equal(rows[0]?.status, "sent");
  assert.equal(rows[0]?.last_error, "not_in_channel");
  const again = await deliverCheckoutSlack(runner(db), report({ id: "cr-join" }), {
    orgId: ORG,
    webhooks: { radcabcr: RAD },
    slackApi: { token: TOKEN, channelId: CHANNEL },
    slackFetch,
    fetchImpl: async () => {
      throw new Error("should not post again");
    },
  });
  assert.equal(again, "skipped");
});

test("other fleets still DM text only, with no PDF or photo files", async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  const calls: string[] = [];
  const saved = report({
    id: "cr-turo",
    companyId: "company-turo",
    photos: [photo("lf_fender", true)],
    flagged: true,
  });
  const status = await deliverCheckoutSlack(runner(db), saved, {
    orgId: ORG,
    route: { mode: "damage_or_fail", destination: "ashley_dm" },
    webhooks: { radcabcr: RAD, ashleyDm: ASH },
    slackApi: { token: TOKEN, channelId: CHANNEL },
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, status: 200, text: async () => "ok" };
    },
    slackFetch: async (url) => {
      calls.push(url);
      return { ok: false, status: 500, text: async () => "files should not upload" };
    },
    loadThreadFiles: async () => {
      throw new Error("files should not load");
    },
  });
  assert.equal(status, "sent");
  assert.deepEqual(calls, [ASH]);
});
