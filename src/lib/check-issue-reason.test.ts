import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyInspectionForm,
  checkIssueLines,
  formatCheckResult,
  inspectionFormSummaryLines,
  normalizeInspectionForm,
  validateInspectionForm,
} from "./inspection-form.ts";

function readyForm() {
  const form = createEmptyInspectionForm("gas");
  for (const id of Object.keys(form.checks) as Array<keyof typeof form.checks>) {
    form.checks[id] = { result: "ok" };
  }
  form.treadByTire = { lf: "good", rf: "good", lr: "good", rr: "good" };
  form.interiorClean = "yes";
  form.exteriorClean = "yes";
  form.fuelGauge = "full";
  return form;
}

test("an issue needs a reason, and the note stays optional", () => {
  const missing = readyForm();
  missing.checks.oil = { result: "not_ok", note: "only a note" };
  const blocked = validateInspectionForm(missing, "gas", { includeClover: false });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.missing.includes("oil"), true);

  const form = readyForm();
  form.checks.oil = {
    result: "not_ok",
    reason: "not_working",
    note: "slow to rise",
  };
  const ok = validateInspectionForm(form, "gas", { includeClover: false });
  assert.equal(ok.ok, true);
  assert.equal(formatCheckResult(form.checks.oil), "Issue — Not working");

  const kept = normalizeInspectionForm({
    ...form,
    checks: {
      ...form.checks,
      oil: { result: "not_ok", reason: "couldnt_check", note: "dark" },
    },
  });
  assert.equal(kept.checks.oil.reason, "couldnt_check");
  assert.equal(kept.checks.oil.note, "dark");
  assert.equal(formatCheckResult(kept.checks.oil), "Issue — Couldn't check");

  const old = normalizeInspectionForm({
    ...form,
    checks: {
      ...form.checks,
      headlights: { result: "not_ok", note: "out" },
    },
  });
  assert.equal(old.checks.headlights.reason, undefined);
  assert.equal(formatCheckResult(old.checks.headlights), "Issue");
});

test("the server still accepts old-app issues that have no reason", () => {
  const form = readyForm();
  form.checks.headlights = { result: "not_ok", note: "left out" };
  const app = validateInspectionForm(form, "gas", { includeClover: false });
  assert.equal(app.ok, false);
  const server = validateInspectionForm(form, "gas", {
    includeClover: false,
    requireIssueReason: false,
  });
  assert.equal(server.ok, true);
  form.checks.headlights = { result: "" };
  const unanswered = validateInspectionForm(form, "gas", {
    includeClover: false,
    requireIssueReason: false,
  });
  assert.equal(unanswered.ok, false);
});

test("issue lines show reason and note for Slack, office and PDF", () => {
  const form = readyForm();
  form.checks.headlights = { result: "not_ok", reason: "not_working", note: "left bulb" };
  form.checks.brakeLights = { result: "not_ok", reason: "other" };
  form.checks.licensePlateTabs = { result: "not_ok", note: "expired" };
  assert.deepEqual(checkIssueLines(form), [
    "Headlights: Issue — Not working — left bulb",
    "Brake lights: Issue — Other",
    "License plate-tabs: Issue — expired",
  ]);
  assert.deepEqual(checkIssueLines(readyForm()), []);
  const pdf = inspectionFormSummaryLines(form, { includeClover: false });
  assert.ok(pdf.includes("Headlights: Issue — Not working — left bulb"));
});
