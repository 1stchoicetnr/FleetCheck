import assert from "node:assert/strict";
import test from "node:test";
import { checkoutAlertId, checkoutAlertKinds } from "./checkout-alert-rules.ts";

test("needs repair creates damage and needs-work alerts", () => {
  assert.deepEqual(checkoutAlertKinds({ needsRepair: true }), [
    "damage_reported",
    "status_needs_work",
  ]);
});

test("a photo damage flag creates a damage alert", () => {
  assert.deepEqual(checkoutAlertKinds({ photoDamage: true }), ["damage_reported"]);
});

test("a clean report creates no alert", () => {
  assert.deepEqual(checkoutAlertKinds({}), []);
});

test("alert ids are stable per report and kind", () => {
  assert.equal(
    checkoutAlertId("1792451914735-b2d5nj5", "damage_reported"),
    "1792451914735-b2d5nj5:damage_reported"
  );
});
