import assert from "node:assert/strict";
import test from "node:test";
import { shouldRunUpkeep, UPKEEP_EVERY_MS } from "./upkeep-throttle.ts";

test("app traffic runs upkeep in production at most every few minutes", () => {
  const now = 10_000_000;
  assert.equal(shouldRunUpkeep({ env: "production", now, lastRun: 0, running: false }), true);
  assert.equal(
    shouldRunUpkeep({ env: "production", now, lastRun: now - UPKEEP_EVERY_MS + 1, running: false }),
    false
  );
  assert.equal(
    shouldRunUpkeep({ env: "production", now, lastRun: now - UPKEEP_EVERY_MS, running: false }),
    true
  );
  assert.equal(shouldRunUpkeep({ env: "production", now, lastRun: 0, running: true }), false);
});

test("preview builds never run upkeep (they share the live database and Slack)", () => {
  assert.equal(shouldRunUpkeep({ env: "preview", now: 10_000_000, lastRun: 0, running: false }), false);
  assert.equal(shouldRunUpkeep({ env: "development", now: 10_000_000, lastRun: 0, running: false }), false);
  assert.equal(shouldRunUpkeep({ env: undefined, now: 10_000_000, lastRun: 0, running: false }), true);
});

test("upkeep runs at least every 5 minutes of traffic, far more often than the daily cron", () => {
  assert.ok(UPKEEP_EVERY_MS <= 5 * 60 * 1000);
});
