import assert from "node:assert/strict";
import test from "node:test";
import { formatLastCheckLine } from "./vehicle-check-status.ts";

test("older vehicle lines use Pacific time", () => {
  assert.equal(
    formatLastCheckLine({
      lastCheckAt: "2026-10-27T21:45:00.000Z",
      driverName: "Test Driver",
      checkType: "check_out",
    }),
    "Last check out by Test Driver · Oct 27, 2026, 2:45 PM PT"
  );
});
