import assert from "node:assert/strict";
import test from "node:test";
import { planLocalUnitImport } from "./import-local-units.ts";

const allowed = ["company-rad-cab", "company-1st-choice", "company-other-fleets"];

test("a different unit number with the same plate is not a second unit", () => {
  const plan = planLocalUnitImport(
    [
      {
        companyId: "company-rad-cab",
        unitNumber: "68",
        plate: "GEN-2468",
        make: "Hyundai",
        model: "Elantra",
        year: 2021,
      },
    ],
    [
      {
        companyId: "company-rad-cab",
        unitNumber: "GEN-2468",
        plate: "GEN2468",
      },
    ],
    allowed
  );
  assert.equal(plan.import.length, 0);
  assert.equal(plan.skipped[0]?.reason, "ambiguous");
});

test("demo plates and Pinkie Tow stay off the server list", () => {
  const plan = planLocalUnitImport(
    [
      {
        companyId: "company-other-fleets",
        unitNumber: "7890",
        plate: "CAM-7890",
        make: "Nissan",
        model: "Altima",
        year: 2022,
      },
      {
        companyId: "company-pinkie-tow",
        unitNumber: "P1",
        plate: "PNK-0001",
        make: "Ford",
        model: "F-450",
        year: 2019,
      },
    ],
    [],
    allowed
  );
  assert.equal(plan.import.length, 0);
  assert.deepEqual(
    plan.skipped.map((item) => item.reason),
    ["demo", "fleet"]
  );
});

test("a non-demo van missing from the server is imported once", () => {
  const plan = planLocalUnitImport(
    [
      {
        companyId: "company-rad-cab",
        unitNumber: "44",
        plate: "RC-0044",
        make: "Dodge",
        model: "Caravan",
        year: 2016,
      },
      {
        companyId: "company-rad-cab",
        unitNumber: "44",
        plate: "RC-0044",
        make: "Dodge",
        model: "Caravan",
        year: 2016,
      },
    ],
    [],
    allowed
  );
  assert.equal(plan.import.length, 1);
  assert.equal(plan.skipped[0]?.reason, "duplicate");
});
