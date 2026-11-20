import assert from "node:assert/strict";
import test from "node:test";
import {
  callCostUsd,
  cleanPhotoCheckSettings,
  lastCleanPhoto,
  openPhotoCheckFindings,
  pacificMonthStart,
  parseVerdict,
  photoCheckPlan,
  underCap,
  PHOTO_CHECK_MODEL,
} from "./photo-check.ts";
import { runPhotoCheck, type PhotoCheckDeps } from "./photo-check-core.ts";
import { mergeCompanySettings, publicCompanySettings } from "./company-settings.ts";

type P = Record<string, unknown> & { angle: string; dataUrl?: string };
const check = (id: string, at: string, driverName: string, photos: P[], damage?: Record<string, unknown>) =>
  ({ id, completedAt: at, driverName, photos, inspectionForm: damage ? { damage } : {} }) as never;

test("off by default; the cap defaults to $10 and is bounded", () => {
  assert.deepEqual(cleanPhotoCheckSettings(undefined), { enabled: false, monthlyCapUsd: 10 });
  assert.deepEqual(cleanPhotoCheckSettings({ enabled: "yes", monthlyCapUsd: 9999 }), { enabled: false, monthlyCapUsd: 500 });
  assert.deepEqual(publicCompanySettings(null).photoCheck, { enabled: false, monthlyCapUsd: 10 });
  const on = mergeCompanySettings(null, { photoCheck: { enabled: true, monthlyCapUsd: 25 } });
  assert.deepEqual(publicCompanySettings(on).photoCheck, { enabled: true, monthlyCapUsd: 25 });
  const off = mergeCompanySettings(on, { photoCheck: { enabled: false, monthlyCapUsd: 10 } });
  assert.equal(off, null, "back to default stores nothing");
  assert.equal(underCap(9.99, { enabled: true, monthlyCapUsd: 10 }), true);
  assert.equal(underCap(10, { enabled: true, monthlyCapUsd: 10 }), false);
  assert.equal(underCap(0, { enabled: false, monthlyCapUsd: 10 }), false);
});

test("model answers: only a confident change counts; junk counts as no change", () => {
  assert.deepEqual(parseVerdict('{"changed":true,"confidence":0.82,"summary":"New dent on front bumper","box":{"x":0.2,"y":0.5,"w":0.3,"h":0.2}}'), {
    changed: true,
    confidence: 0.82,
    summary: "New dent on front bumper",
    box: { x: 0.2, y: 0.5, w: 0.3, h: 0.2 },
  });
  assert.equal(parseVerdict('{"changed":true,"confidence":0.4,"summary":"maybe","box":null}').changed, false);
  assert.equal(parseVerdict("not json").changed, false);
  assert.equal(parseVerdict('```json\n{"changed":false,"confidence":0.9,"summary":"","box":null}\n```').summary, "No change");
  assert.equal(parseVerdict('{"changed":true,"confidence":0.9,"summary":"x","box":{"x":0.1,"y":0.1,"w":0,"h":0.2}}').box, undefined);
});

test("cost: the gateway's figure when present, else tokens x Gemini 2.5 Flash list price", () => {
  assert.equal(callCostUsd({ cost: 0.0012 }), 0.0012);
  assert.equal(callCostUsd({ prompt_tokens: 2000, completion_tokens: 100 }), 0.00085);
  assert.equal(callCostUsd(undefined), 0);
});

test("month starts in Pacific time", () => {
  assert.equal(pacificMonthStart(new Date("2026-11-20T18:00:00Z")), "2026-11-01T07:00:00.000Z");
  assert.equal(pacificMonthStart(new Date("2026-12-01T05:00:00Z")), "2026-11-01T07:00:00.000Z", "still Nov 30 in LA");
});

const now = check("now", "2026-11-20T16:00:00Z", "Ken Taylor", [
  { angle: "front", dataUrl: "blob:front-now" },
  { angle: "rear", dataUrl: "blob:rear-now", flaggedDamage: true },
  { angle: "driver_doors", dataUrl: "blob:dd-now", knownDamageId: "kd1", knownDamageAnswer: "same" },
  { angle: "odometer_fuel", dataUrl: "blob:odo" },
]);
const history = [
  check("old", "2026-11-03T06:00:00Z", "Mike", [{ angle: "front", dataUrl: "blob:front-mike" }, { angle: "driver_doors", dataUrl: "blob:dd-mike" }]),
  check("dmg", "2026-11-04T14:50:00Z", "Chris", [{ angle: "front", dataUrl: "blob:front-chris" }], { front: "Hole and scratches" }),
  check("kd", "2026-11-10T14:50:00Z", "Amber", [{ angle: "driver_doors", dataUrl: "blob:dd-known" }]),
];

test("compares against the last clean photo, or the known-damage photo; skips reported and non-body slots", () => {
  assert.equal(lastCleanPhoto(now, history, "front")?.reportId, "old", "Chris noted front damage, so Mike's is the last clean");
  const plan = photoCheckPlan(now, history, [{ angle: "driver_doors", sourceReportId: "kd" }]);
  assert.deepEqual(
    plan.map((p) => [p.angle, p.baseline.reportId, p.baseline.kind]),
    [["front", "old", "clean"], ["driver_doors", "kd", "known"]]
  );
});

function deps(over: Partial<PhotoCheckDeps> = {}, answers: Record<string, string> = {}) {
  const saved: Record<string, unknown>[] = [];
  const alerts: unknown[] = [];
  const calls: string[] = [];
  const d: PhotoCheckDeps = {
    settings: async () => ({ enabled: true, monthlyCapUsd: 10 }),
    spentThisMonth: async () => 0,
    knownDamage: async () => [{ angle: "driver_doors", sourceReportId: "kd" }],
    imageDataUrl: async (s) => `data:image/jpeg;base64,${s}`,
    token: async () => "test-token",
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.model, PHOTO_CHECK_MODEL);
      assert.deepEqual(body.reasoning, { effort: "none" });
      assert.equal(init.headers.Authorization, "Bearer test-token");
      const after = body.messages[0].content[4].image_url.url as string;
      calls.push(after);
      const content = answers[after] ?? '{"changed":false,"confidence":0.9,"summary":"No change","box":null}';
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 2000, completion_tokens: 50 } }), text: async () => "" };
    },
    save: async (r) => void saved.push(r as Record<string, unknown>),
    insertAlert: async (a) => void alerts.push(a),
    now: () => new Date("2026-11-20T16:05:00Z"),
    ...over,
  };
  return { d, saved, alerts, calls };
}

test("a likely change goes to the office queue only, with the change boxed", async () => {
  const { d, saved, alerts, calls } = deps({}, {
    "data:image/jpeg;base64,blob:dd-now": '{"changed":true,"confidence":0.8,"summary":"New scrape on rear door","box":{"x":0.5,"y":0.4,"w":0.2,"h":0.2}}',
  });
  const out = await runPhotoCheck("org-1", now, history, d);
  assert.deepEqual(out, { ran: 2, found: ["driver_doors"] });
  assert.equal(calls.length, 2);
  const result = (saved[0] as Record<string, { changed: boolean; againstKind: string; costUsd: number }>).driver_doors;
  assert.equal(result.changed, true);
  assert.equal(result.againstKind, "known");
  assert.ok(result.costUsd > 0);
  assert.equal(alerts.length, 1);
  const alert = alerts[0] as { id: string; type: string; message: string };
  assert.equal(alert.id, "now:photo_check");
  assert.equal(alert.type, "photo_check");
  assert.match(alert.message, /Found by photo check on .*: Driver.* New scrape on rear door \(80%\)/);
});

test("off, over the cap, or no credential: no calls", async () => {
  for (const [over, why] of [
    [{ settings: async () => ({ enabled: false, monthlyCapUsd: 10 }) }, "off"],
    [{ spentThisMonth: async () => 10 }, "cap"],
    [{ token: async () => undefined }, "no gateway credential"],
  ] as const) {
    const { d, calls, alerts } = deps(over as Partial<PhotoCheckDeps>);
    const out = await runPhotoCheck("org-1", now, history, d);
    assert.equal(out.skipped, why);
    assert.equal(calls.length, 0);
    assert.equal(alerts.length, 0);
  }
});

test("stops mid-check at the cap, and on no credits", async () => {
  const { d, calls } = deps({ spentThisMonth: async () => 9.9995 });
  await runPhotoCheck("org-1", now, history, d);
  assert.equal(calls.length, 1, "first call pushes spend past the cap");
  let n = 0;
  const broke = deps({
    fetch: async () => {
      n += 1;
      return { ok: false, status: 402, json: async () => ({}), text: async () => "insufficient credits" };
    },
  });
  const out = await runPhotoCheck("org-1", now, history, broke.d);
  assert.equal(n, 1);
  assert.equal(out.found.length, 0);
  assert.match(String((broke.saved[0] as Record<string, { error: string }>).front.error), /402/);
});

test("open findings are the ones the office has not decided", () => {
  const base = { confidence: 0.8, summary: "x", againstReportId: "a", againstKind: "clean" as const, model: "m", costUsd: 0, at: "t" };
  assert.deepEqual(
    openPhotoCheckFindings([
      { angle: "front", dataUrl: "", photoCheck: { ...base, changed: true } },
      { angle: "rear", dataUrl: "", photoCheck: { ...base, changed: true, review: { verdict: "dismissed", by: "Bell", at: "t" } } },
      { angle: "lf_corner", dataUrl: "", photoCheck: { ...base, changed: false } },
    ] as never),
    ["front"]
  );
});
