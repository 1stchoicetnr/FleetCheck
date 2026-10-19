import assert from "node:assert/strict";
import test from "node:test";
import { odometerPrefill } from "./odometer-prefill.ts";

test("a unit with no mileage prefills blank", () => {
  assert.equal(odometerPrefill(undefined), "");
  assert.equal(odometerPrefill(null), "");
});

test("a unit prefills only its own last mileage", () => {
  assert.equal(odometerPrefill(145810), "145810");
});
