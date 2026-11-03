import assert from "node:assert/strict";
import { test } from "node:test";
import { finishDecision, pollFinish } from "./checkout-finish.ts";
import type { PhotoStep } from "./types.ts";

const step = (angle: string, required = true) =>
  ({ angle, label: angle, instruction: "", icon: "", category: "exterior", required }) as PhotoStep;
const steps = [step("front"), step("rear"), step("insurance")];
const created = "2026-11-03T14:33:51.833Z";
const photo = (angle: string) => ({ angle, dataUrl: "https://blob/x.jpg", capturedAt: created }) as never;
const report = (over: Record<string, unknown> = {}) =>
  ({
    createdAt: created,
    idempotencyKey: undefined,
    photos: [photo("front"), photo("rear")],
    inspectionForm: undefined,
    sentAt: undefined,
    archivedAt: undefined,
    ...over,
  }) as never as Parameters<typeof finishDecision>[0];

test("old-app check with every walkaround photo is sent even though the row still says uploading", () => {
  // Status flag is not an input: only stored photos decide.
  assert.deepEqual(finishDecision(report({ status: "uploading" }), steps), { action: "send" });
});

test("old-app check still missing a walkaround photo waits", () => {
  assert.deepEqual(finishDecision(report({ photos: [photo("front")] }), steps), {
    action: "wait",
    missing: ["rear"],
  });
});

test("current-app check still needs insurance", () => {
  assert.deepEqual(finishDecision(report({ idempotencyKey: "k1" }), steps), {
    action: "wait",
    missing: ["insurance"],
  });
});

test("sent or archived check is left alone, so Slack is never posted twice from here", () => {
  assert.deepEqual(finishDecision(report({ sentAt: created }), steps), { action: "skip", reason: "sent" });
  assert.deepEqual(finishDecision(report({ archivedAt: created }), steps), {
    action: "skip",
    reason: "archived",
  });
});

test("watch stops as soon as the last photo lands", async () => {
  const seen: number[] = [];
  const answers = ["wait", "wait", "send"] as const;
  const result = await pollFinish(async () => answers[seen.push(1) - 1], {
    tries: 10,
    delayMs: 5000,
    sleep: async () => {},
  });
  assert.deepEqual(result, { action: "send", tries: 3 });
});

test("watch gives up after its tries and leaves the check for the sweep", async () => {
  let sleeps = 0;
  const result = await pollFinish(async () => "wait", {
    tries: 4,
    delayMs: 1,
    sleep: async () => {
      sleeps += 1;
    },
  });
  assert.deepEqual(result, { action: "wait", tries: 4 });
  assert.equal(sleeps, 3);
});

test("watch stops on skip (already sent by an upload)", async () => {
  const result = await pollFinish(async () => "skip", { tries: 5, delayMs: 1, sleep: async () => {} });
  assert.deepEqual(result, { action: "skip", tries: 1 });
});
