import test from "node:test";
import assert from "node:assert/strict";
import { odometerMismatchNotes } from "./photo-flags.ts";
import { toOfficeListReport } from "./office-list.ts";
import type { CheckoutReport } from "./types.ts";

test("odometerMismatchNotes keeps only Odometer check notes", () => {
  assert.deepEqual(odometerMismatchNotes(undefined), []);
  assert.deepEqual(
    odometerMismatchNotes([
      { angle: "odometer", qualityNote: "  Odometer check: read 12345 Driver note: glare " },
      { angle: "front", qualityNote: "blurry" },
      { angle: "rear", qualityNote: "   " },
      { angle: "left" },
      { angle: "right", qualityNote: "odometer CHECK: lower" },
    ] as never),
    ["Odometer check: read 12345 Driver note: glare", "odometer CHECK: lower"]
  );
});

test("toOfficeListReport keeps odometer notes but drops other quality notes", () => {
  const report = {
    photos: [
      { angle: "odometer", capturedAt: "x", dataUrl: "data:abc", qualityNote: "Odometer check: mismatch" },
      { angle: "front", capturedAt: "x", dataUrl: "data:abc", qualityNote: "blurry" },
    ],
  } as unknown as CheckoutReport;
  const row = toOfficeListReport(report);
  assert.equal(row.photos[0].qualityNote, "Odometer check: mismatch");
  assert.equal(row.photos[1].qualityNote, undefined);
  assert.equal(row.photos[0].dataUrl, "");
  assert.deepEqual(odometerMismatchNotes(row.photos), ["Odometer check: mismatch"]);
});
