import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyInspectionForm } from "./inspection-form.ts";
import { repeatedIssues } from "./repeat-issues.ts";

function oilOpen() {
  const form = createEmptyInspectionForm("gas");
  form.checks.oil = { result: "not_ok" };
  return { inspectionForm: form, photos: [] };
}

test("the same open oil level on a second check is a repeat", () => {
  const repeats = repeatedIssues(oilOpen(), [oilOpen()]);
  assert.equal(repeats.length, 1);
  assert.equal(repeats[0]?.key, "check:oil");
  assert.equal(repeats[0]?.label, "Oil");
  assert.equal(repeats[0]?.count, 2);
});

test("one open oil level does not flag, and a different issue does not count", () => {
  const other = createEmptyInspectionForm("gas");
  other.checks.headlights = { result: "not_ok" };
  assert.equal(repeatedIssues(oilOpen(), []).length, 0);
  assert.equal(repeatedIssues(oilOpen(), [{ inspectionForm: other }]).length, 0);
});

test("a third check still counts as the same repeat", () => {
  const repeats = repeatedIssues(oilOpen(), [oilOpen(), oilOpen()]);
  assert.equal(repeats[0]?.count, 3);
});
