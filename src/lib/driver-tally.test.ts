import assert from "node:assert/strict";
import test from "node:test";
import { postAshleySlackDm, ASHLEY_SLACK_DM } from "./ashley-slack.ts";
import { RADCABCR_CHANNEL_ID } from "./slack-config.ts";
import {
  driverTallyText,
  isRadarCompany,
  repeatProblemNote,
  tallyWindows,
  type TallyCheck,
} from "./driver-tally.ts";

const MONDAY = new Date("2026-10-26T14:15:00.000Z");
const TUESDAY = new Date("2026-10-27T14:15:00.000Z");
const MONTH_START = new Date("2026-11-01T14:15:00.000Z");

test("the tally goes out on Monday and on the first, and skips other days", () => {
  const week = tallyWindows(MONDAY);
  assert.equal(week.length, 1);
  assert.equal(week[0]?.kind, "week");
  assert.equal(week[0]?.key, "week:2026-10-19");
  assert.equal(tallyWindows(TUESDAY).length, 0);
  const month = tallyWindows(MONTH_START);
  assert.equal(month.length, 1);
  assert.equal(month[0]?.kind, "month");
  assert.equal(month[0]?.key, "month:2026-10");
});

test("the weekly tally skips Radar and names each driver", () => {
  const window = tallyWindows(MONDAY)[0];
  assert.ok(window);
  const checks: TallyCheck[] = [
    { driverName: "Ken Taylor", reviewStatus: "fail", companyId: "company-rad-cab" },
    { driverName: "Ada Lovelace", reviewStatus: "pass", companyId: "company-rad-cab" },
    { driverName: "Ada Lovelace", reviewStatus: "conditional", companyId: "company-turo" },
    { driverName: "Radar Pat", reviewStatus: "fail", companyId: "company-radar", companyName: "Radar" },
  ];
  const text = driverTallyText(window, checks);
  assert.match(text || "", /Ada Lovelace — 2 checks · 1 pass · 1 conditional · 0 fail/);
  assert.match(text || "", /Ken Taylor — 1 check · 0 pass · 0 conditional · 1 fail/);
  assert.equal(text?.includes("Radar"), false);
  assert.equal(isRadarCompany("company-radar", "Radar"), true);
  const monthly = driverTallyText(
    { ...window, kind: "month", label: "October 2026" },
    checks.filter((check) => isRadarCompany(check.companyId, check.companyName))
  );
  assert.match(monthly || "", /Radar Pat/);
});

test("a repeat note and the tally post only to Ashley", async () => {
  const note = repeatProblemNote("Oil is open again on Unit 8 (2 checks)", "Ada Lovelace");
  assert.match(note, /Repeat problem/);
  assert.match(note, /Ada Lovelace/);
  assert.equal(note.includes("#"), false);
  assert.notEqual(ASHLEY_SLACK_DM, RADCABCR_CHANNEL_ID);

  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl = async (url: string, init: { body?: string }) => {
    calls.push({ url, body: String(init.body || "") });
    return { ok: true, status: 200, text: async () => "{\"ok\":true}" };
  };
  const sent = await postAshleySlackDm(note, {
    token: "xoxb-test",
    webhookUrl: "https://hooks.example.test/radcab",
    fetchImpl,
  });
  assert.equal(sent, "bot");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://slack.com/api/chat.postMessage");
  const body = JSON.parse(calls[0]?.body || "{}") as { channel?: string };
  assert.equal(body.channel, "DHPKVTEBD");
  assert.notEqual(body.channel, RADCABCR_CHANNEL_ID);
});
