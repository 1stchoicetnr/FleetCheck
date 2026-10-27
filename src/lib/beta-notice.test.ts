import assert from "node:assert/strict";
import test from "node:test";
import { BETA_NOTICE } from "./beta-notice.ts";

test("the beta notice is short, calm, and does not name a Slack channel", () => {
  assert.match(BETA_NOTICE, /Inspekt is in beta/);
  assert.match(BETA_NOTICE, /Feedback/);
  assert.match(BETA_NOTICE, /Slack/);
  assert.equal(BETA_NOTICE.includes("#"), false);
  assert.equal(/radcab|channel/i.test(BETA_NOTICE), false);
  assert.equal(/truck|cab|van|trailer|alarm|urgent|broken/i.test(BETA_NOTICE), false);
  assert.ok(BETA_NOTICE.length < 220);
});
