import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyInspectionForm,
  inspectionFormFlagsReport,
  inspectionFormSummaryLines,
  suggestedTrafficLight,
  treadSummaryChip,
  type TreadByTire,
} from "./inspection-form.ts";

function tread(levels: Partial<TreadByTire>): TreadByTire {
  return { lf: "", rf: "", lr: "", rr: "", ...levels };
}

test("the tire summary chip names the worst tread without saying Worst Good", () => {
  assert.deepEqual(treadSummaryChip(tread({ lf: "good", rf: "good", lr: "good", rr: "good" })), {
    label: "Tires: all good",
    tone: "good",
  });
  assert.equal(
    treadSummaryChip(tread({ lf: "good", rf: "good", lr: "good" })),
    null
  );
  assert.deepEqual(
    treadSummaryChip(tread({ lf: "good", rf: "fair", lr: "good", rr: "good" })),
    { label: "Tires: worst Fair", tone: "fair" }
  );
  assert.deepEqual(
    treadSummaryChip(tread({ lf: "fair", rf: "low", lr: "good", rr: "fair" })),
    { label: "Tires: worst Low", tone: "low" }
  );
  assert.deepEqual(
    treadSummaryChip(tread({ lf: "low", rf: "bald", lr: "good", rr: "fair" })),
    { label: "Tires: worst Bald", tone: "bald" }
  );
});

test("the PDF tread line lists each tire and does not print Worst", () => {
  const form = createEmptyInspectionForm("gas");
  form.treadByTire = { lf: "good", rf: "fair", lr: "good", rr: "good" };
  const lines = inspectionFormSummaryLines(form, { includeClover: false });
  const treadLine = lines.find((line) => line.startsWith("Tread:"));
  assert.equal(treadLine, "Tread: LF Good · RF Fair · LR Good · RR Good");
  assert.equal(lines.some((line) => line.includes("Worst")), false);
});

test("tread still only suggests red for bald and yellow for low, and flags those two", () => {
  const cases = [
    { level: "good" as const, light: "green" as const, flagged: false },
    { level: "fair" as const, light: "green" as const, flagged: false },
    { level: "low" as const, light: "yellow" as const, flagged: true },
    { level: "bald" as const, light: "red" as const, flagged: true },
  ];
  for (const item of cases) {
    const form = createEmptyInspectionForm("gas");
    form.treadByTire = { lf: item.level, rf: "good", lr: "good", rr: "good" };
    form.interiorClean = "yes";
    form.exteriorClean = "yes";
    assert.equal(suggestedTrafficLight(form), item.light, item.level);
    assert.equal(inspectionFormFlagsReport(form), item.flagged, item.level);
  }
});
