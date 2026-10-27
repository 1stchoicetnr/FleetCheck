import assert from "node:assert/strict";
import test from "node:test";
import {
  appTrafficLight,
  createEmptyInspectionForm,
  INSPECTION_CHECK_ITEMS,
  reviewStatusForLight,
  shouldRefreshAppResult,
  validateInspectionForm,
  withAppResult,
  type CheckoutInspectionForm,
} from "./inspection-form.ts";

function ready(patch: Partial<CheckoutInspectionForm> = {}): CheckoutInspectionForm {
  const form = createEmptyInspectionForm("gas");
  for (const item of INSPECTION_CHECK_ITEMS) {
    form.checks[item.id] = { result: "ok" };
  }
  form.interiorClean = "yes";
  form.exteriorClean = "yes";
  form.treadByTire = { lf: "good", rf: "good", lr: "good", rr: "good" };
  form.fuelGauge = "full";
  return { ...form, ...patch, checks: patch.checks ?? form.checks };
}

test("the app sets pass, conditional, and fail without a driver light", () => {
  const clear = ready();
  assert.equal(validateInspectionForm(clear, "gas", { includeClover: false }).ok, true);
  assert.equal(appTrafficLight(clear), "green");
  assert.equal(reviewStatusForLight("green"), "pass");

  const low = ready({
    treadByTire: { lf: "low", rf: "good", lr: "good", rr: "good" },
  });
  assert.equal(appTrafficLight(low), "yellow");
  assert.equal(reviewStatusForLight("yellow"), "conditional");

  const oil = ready();
  oil.checks.oil = { result: "not_ok" };
  assert.equal(appTrafficLight(oil), "yellow");

  const marked = ready();
  assert.equal(appTrafficLight(marked, [{ flaggedDamage: true }]), "yellow");

  const bald = ready({
    treadByTire: { lf: "bald", rf: "good", lr: "good", rr: "good" },
  });
  assert.equal(appTrafficLight(bald), "red");
  assert.equal(appTrafficLight(bald, [{ flaggedDamage: true }]), "red");
  assert.equal(reviewStatusForLight("red"), "fail");

  const safety = ready({ issueFlags: { safety: true } });
  assert.equal(appTrafficLight(safety), "red");

  const stored = withAppResult(oil);
  assert.equal(stored.resultSource, "app");
  assert.equal(stored.trafficLight, "yellow");
});

test("older checks and office overrides are not recomputed", () => {
  const older = ready();
  assert.equal(shouldRefreshAppResult(older, undefined), false);
  const appSet = withAppResult(older);
  assert.equal(shouldRefreshAppResult(appSet, undefined), true);
  assert.equal(shouldRefreshAppResult(appSet, "Ada"), false);
  assert.equal(
    shouldRefreshAppResult({ ...appSet, resultSource: "office" }, undefined),
    false
  );
});
