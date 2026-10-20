import assert from "node:assert/strict";
import test from "node:test";
import { displayPlate, normalizePlate } from "./plate.ts";

test("a plate keeps the hyphen it was entered with", () => {
  assert.equal(displayPlate("gen-2468"), "GEN-2468");
  assert.equal(displayPlate(" GEN2468 "), "GEN2468");
});

test("lookup still treats hyphenated and plain plates as the same unit", () => {
  assert.equal(normalizePlate(displayPlate("GEN-2468")), normalizePlate("GEN2468"));
});
