import assert from "node:assert/strict";
import test from "node:test";
import { odometerPrefill, odometerWarning } from "./odometer-prefill.ts";

test("a new check does not copy the last odometer", () => {
  assert.equal(odometerPrefill(undefined), "");
  assert.equal(odometerPrefill(null), "");
  assert.equal(odometerPrefill(145810), "");
});

test("odometer warns when the reading is lower or more than 1,000 miles higher", () => {
  assert.equal(odometerWarning(145900, 145810), null);
  assert.equal(odometerWarning(146810, 145810), null);
  assert.match(odometerWarning(145000, 145810) || "", /lower than the last reading/);
  assert.match(odometerWarning(147000, 145810) || "", /1,000 miles/);
  assert.equal(odometerWarning(100, null), null);
});
