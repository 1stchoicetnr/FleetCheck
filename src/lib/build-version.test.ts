import assert from "node:assert/strict";
import test from "node:test";
import { isCheckInProgressPath } from "./build-version.ts";

test("app updates wait while a driver is on a check screen", () => {
  assert.equal(isCheckInProgressPath("/checkout/cr-rad-cab-unit-5-check_out-u1"), true);
  assert.equal(isCheckInProgressPath("/check-in/abc"), true);
  assert.equal(isCheckInProgressPath("/checkout"), false);
  assert.equal(isCheckInProgressPath("/dashboard"), false);
  assert.equal(isCheckInProgressPath("/office/123"), false);
});
