import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyInspectionForm,
  formatCheckResult,
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
  assert.equal(formatCheckResult(form.checks.oil), "Not working");

  const kept = normalizeInspectionForm({
    ...form,
    checks: {
      ...form.checks,
      oil: { result: "not_ok", reason: "couldnt_check", note: "dark" },
    },
  });
  assert.equal(kept.checks.oil.reason, "couldnt_check");
  assert.equal(kept.checks.oil.note, "dark");
  assert.equal(formatCheckResult(kept.checks.oil), "Couldn't check");

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
