import assert from "node:assert/strict";
import test from "node:test";
import { sessionNeedsRenewal } from "./server/auth-tokens.ts";

const day = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-11-18T19:00:00Z");

test("a session past its halfway point is renewed on app open", () => {
  assert.equal(sessionNeedsRenewal(new Date(now + 3 * day).toISOString(), now), true);
  assert.equal(sessionNeedsRenewal(new Date(now + 3 * day), now), true);
});

test("a fresh or expired session is left alone", () => {
  assert.equal(sessionNeedsRenewal(new Date(now + 13 * day).toISOString(), now), false);
  assert.equal(sessionNeedsRenewal(new Date(now - 1000).toISOString(), now), false);
  assert.equal(sessionNeedsRenewal(undefined, now), false);
});
