import assert from "node:assert/strict";
import test from "node:test";
import { summarizeUnits, unitCountLine, unitsForCompany } from "./unit-counts.ts";

test("company filter keeps only that company's units", () => {
  const units = [
    { id: "t1", companyId: "company-1st-choice" },
    { id: "12", companyId: "company-rad-cab" },
  ];
  assert.deepEqual(
    unitsForCompany(units, "company-1st-choice").map((unit) => unit.id),
    ["t1"]
  );
});

test("active and archived counts are the same totals every screen can show", () => {
  const summary = summarizeUnits([
    { companyId: "company-rad-cab" },
    { companyId: "company-rad-cab", archivedAt: "2026-10-19T00:00:00.000Z" },
    { companyId: "company-1st-choice" },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.active, 2);
  assert.equal(summary.archived, 1);
  assert.equal(summary.byCompany["company-1st-choice"].active, 1);
  assert.equal(summary.byCompany["company-rad-cab"].archived, 1);
  assert.equal(unitCountLine(summary), "2 active · 1 archived · 3 total");
});
