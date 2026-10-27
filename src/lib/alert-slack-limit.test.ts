import assert from "node:assert/strict";
import test from "node:test";
import { alertSlackLimited, recordAlertSlack, resetAlertSlackLimits } from "./alert-slack-limit.ts";

test("office Slack alerts stop after 20 posts in the window", () => {
  resetAlertSlackLimits();
  const now = Date.parse("2026-10-27T12:00:00.000Z");
  for (let i = 0; i < 20; i += 1) recordAlertSlack("user-office", now);
  assert.equal(alertSlackLimited("user-office", now), true);
  assert.equal(alertSlackLimited("user-other", now), false);
  assert.equal(alertSlackLimited("user-office", now + 16 * 60 * 1000), false);
  resetAlertSlackLimits();
});
