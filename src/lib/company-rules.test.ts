import assert from "node:assert/strict";
import test from "node:test";
import { companyUsesClover, shouldMoveUnitToTuro } from "./company-rules.ts";

test("Clover is only for Rad Cab", () => {
  assert.equal(companyUsesClover("company-rad-cab"), true);
  assert.equal(companyUsesClover("company-1st-choice"), false);
  assert.equal(companyUsesClover("company-turo"), false);
  assert.equal(companyUsesClover("company-other-fleets"), false);
  assert.equal(companyUsesClover("company-pinkie-tow"), false);
  assert.equal(companyUsesClover(undefined), false);
});

test("TUR-9012 moves from Other fleets onto Turo", () => {
  assert.equal(
    shouldMoveUnitToTuro({
      companyId: "company-other-fleets",
      unitNumber: "9012",
      plate: "TUR-9012",
    }),
    true
  );
  assert.equal(
    shouldMoveUnitToTuro({
      companyId: "company-rad-cab",
      unitNumber: "12",
      plate: "RC-0012",
    }),
    false
  );
  assert.equal(
    shouldMoveUnitToTuro({
      companyId: "company-turo",
      unitNumber: "9012",
      plate: "TUR-9012",
    }),
    false
  );
});
