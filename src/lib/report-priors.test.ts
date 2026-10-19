import assert from "node:assert/strict";
import test from "node:test";
import { earlierReports } from "./report-priors.ts";

const earlier = {
  id: "checkout-418",
  completedAt: "2026-10-19T23:18:34.507Z",
};
const later = {
  id: "checkin-421",
  completedAt: "2026-10-19T23:21:00.017Z",
};

test("a later report is not a prior of an earlier one", () => {
  const priors = earlierReports([later], earlier, 2);
  assert.deepEqual(priors, []);
});

test("an earlier report is the prior of a later one", () => {
  const priors = earlierReports([earlier, later], later, 2);
  assert.deepEqual(
    priors.map((report) => report.id),
    ["checkout-418"]
  );
});

test("priors are newest-first and exclude the current report", () => {
  const oldest = { id: "old", completedAt: "2026-10-18T12:00:00.000Z" };
  const priors = earlierReports([later, oldest, earlier], later, 2);
  assert.deepEqual(
    priors.map((report) => report.id),
    ["checkout-418", "old"]
  );
});
