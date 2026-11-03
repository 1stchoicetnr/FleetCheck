import assert from "node:assert/strict";
import test from "node:test";
import { alertDamageDetails, alertDetailParts, repairSlackText, sendRepairSlack } from "./alert-details.ts";

const report = {
  photos: [{ angle: "engine_oil", dataUrl: "x", capturedAt: "", flaggedDamage: true, damageNote: "Open" }],
  inspectionForm: { damage: { left: "Crack ", front: "Bumber", right: "Scratches", marks: ["front"] } },
} as never;

test("inspection damage notes show in alert details", () => {
  const parts = alertDetailParts(alertDamageDetails(report));
  assert.ok(parts.includes("Left side: Crack"));
  assert.ok(parts.includes("Front: Bumber"));
  assert.ok(parts.some((p) => p.includes("(Open)")));
});

test("marks only still give a detail", () => {
  const parts = alertDetailParts(alertDamageDetails({ photos: [], inspectionForm: { damage: { marks: ["left"] } } } as never));
  assert.deepEqual(parts, ["Marked: left"]);
});

test("slack text has driver, details and check link", () => {
  const text = repairSlackText({ unit: "Unit 8", vehicle: "2020 Ford", driverName: "Chris", alertLines: [], details: alertDamageDetails(report), checkUrl: "https://x/office/r1" });
  assert.match(text, /Chris/);
  assert.match(text, /Left side: Crack/);
  assert.match(text, /https:\/\/x\/office\/r1/);
});

test("bot posts to repairs channel and DMs Bell", async () => {
  const calls: { url: string; body: string }[] = [];
  const result = await sendRepairSlack({
    text: "t", channelId: "C1", token: "tok", webhookUrl: "https://hook", dmUserId: "U1",
    fetchImpl: async (url, init) => {
      calls.push({ url, body: init.body });
      const data = url.endsWith("conversations.open") ? { ok: true, channel: { id: "D1" } } : { ok: true };
      return { ok: true, json: async () => data };
    },
  });
  assert.deepEqual(result, { channel: "bot", dm: "sent" });
  assert.ok(calls.some((c) => c.url.endsWith("chat.postMessage") && c.body.includes('"C1"')));
  assert.ok(calls.some((c) => c.url.endsWith("chat.postMessage") && c.body.includes('"D1"')));
  assert.ok(!calls.some((c) => c.url === "https://hook"));
});

test("not in channel falls back to the webhook", async () => {
  const result = await sendRepairSlack({
    text: "t", channelId: "C1", token: "tok", webhookUrl: "https://hook", dmUserId: null,
    fetchImpl: async (url) => ({ ok: true, json: async () => (url.includes("slack.com") ? { ok: false, error: "not_in_channel" } : {}) }),
  });
  assert.deepEqual(result, { channel: "webhook", dm: "skipped" });
});
