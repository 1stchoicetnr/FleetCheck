import assert from "node:assert/strict";
import test from "node:test";
import {
  activeCountByFleetId,
  activeCountLabel,
  fleetSubtitle,
  fleetTitle,
} from "./fleet-rows.ts";

test("a type-only fleet name uses the company, and the type is the subtitle", () => {
  const title = fleetTitle({ name: "Taxi", type: "taxi" }, "Rad Cab");
  assert.equal(title, "Rad Cab");
  assert.equal(fleetSubtitle(title, "taxi"), "Taxi");
});

test("the type is omitted when it repeats the title", () => {
  const title = fleetTitle({ name: "Turo", type: "turo" }, "Turo");
  assert.equal(title, "Turo");
  assert.equal(fleetSubtitle(title, "turo"), null);
});

test("a stored name that is not the type stays the title", () => {
  const title = fleetTitle({ name: "City Taxi Fleet", type: "taxi" }, "Rad Cab");
  assert.equal(title, "City Taxi Fleet");
  assert.equal(fleetSubtitle(title, "taxi"), "Taxi");
});

test("active vehicles count by fleet id, and a shared company is not copied", () => {
  const fleets = [
    { id: "fleet-rad", companyId: "company-rad-cab" },
    { id: "fleet-rad-2", companyId: "company-rad-cab" },
    { id: "fleet-tow", companyId: "company-1st-choice" },
  ];
  const vehicles = [
    { companyId: "company-rad-cab" },
    { companyId: "company-rad-cab" },
    { companyId: "company-rad-cab", fleetId: "fleet-rad" },
    { companyId: "company-rad-cab", archivedAt: "2026-10-19T00:00:00.000Z" },
    { companyId: "company-1st-choice" },
  ];
  const counts = activeCountByFleetId(fleets, vehicles);
  assert.equal(counts["fleet-rad"], 1);
  assert.equal(counts["fleet-rad-2"], 0);
  assert.equal(counts["fleet-tow"], 1);
  assert.equal(activeCountLabel(counts["fleet-tow"]), "1 active");
  assert.equal(activeCountLabel(0).includes("Same"), false);
});

test("one fleet for a company keeps that company's active vehicles", () => {
  const counts = activeCountByFleetId(
    [{ id: "fleet-rad", companyId: "company-rad-cab" }],
    [
      { companyId: "company-rad-cab" },
      { companyId: "company-rad-cab" },
      { companyId: "company-rad-cab", archivedAt: "2026-10-19T00:00:00.000Z" },
    ]
  );
  assert.equal(counts["fleet-rad"], 2);
});
