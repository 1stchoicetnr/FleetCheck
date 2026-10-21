import assert from "node:assert/strict";
import test from "node:test";
import { pageOfficeReports, toOfficeListReport } from "./office-list.ts";
import { cleanDamageNote, damageFlagText, resolveDamageNote } from "./photo-flags.ts";
import type { CheckoutReport } from "./types.ts";

function report(partial: Partial<CheckoutReport> & Pick<CheckoutReport, "id">): CheckoutReport {
  return {
    companyId: "company-rad",
    vehicleId: "vehicle-1",
    unitNumber: "12",
    year: 2020,
    make: "Ford",
    model: "Transit",
    odometer: 1000,
    driverName: "Driver",
    dispatcherName: "Dispatch",
    type: "check_out",
    photos: [
      {
        angle: "front",
        dataUrl: "data:image/jpeg;base64,AAAA",
        capturedAt: "2026-01-01T00:00:00.000Z",
        flaggedDamage: true,
        damageNote: "  cracked bumper  ",
      },
    ],
    status: "complete",
    completedAt: "2026-01-02T00:00:00.000Z",
    reviewStatus: "pending",
    flagged: true,
    synced: true,
    createdAt: "2026-01-02T00:00:00.000Z",
    signatureDataUrl: "data:image/png;base64,BBBB",
    ...partial,
  };
}

test("damage notes are trimmed and capped", () => {
  assert.equal(cleanDamageNote("  "), undefined);
  assert.equal(cleanDamageNote(" dent "), "dent");
  assert.equal(cleanDamageNote("x".repeat(600))?.length, 500);
  assert.equal(
    damageFlagText({ angle: "front", damageNote: " cracked bumper " }),
    "Front: cracked bumper"
  );
  assert.equal(resolveDamageNote(false, "keep me", "old"), undefined);
  assert.equal(resolveDamageNote(true, "", "old"), undefined);
  assert.equal(resolveDamageNote(true, undefined, " old "), "old");
  assert.equal(resolveDamageNote(true, " scratch ", undefined), "scratch");
});

test("office list pages summaries without photo bytes or signatures", () => {
  const reports = [
    report({ id: "a", completedAt: "2026-01-03T00:00:00.000Z" }),
    report({
      id: "b",
      vehicleId: "vehicle-2",
      reviewStatus: "pass",
      flagged: false,
      photos: [],
      completedAt: "2026-01-02T00:00:00.000Z",
    }),
    report({
      id: "c",
      archivedAt: "2026-01-04T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:00.000Z",
    }),
  ];
  const page = pageOfficeReports(reports, { limit: 1, offset: 0, status: "flagged" });
  assert.equal(page.total, 1);
  assert.equal(page.flagged, 1);
  assert.equal(page.reports[0]?.id, "a");
  assert.equal(page.reports[0]?.photos[0]?.dataUrl, "");
  assert.equal(page.reports[0]?.photos[0]?.damageNote, "cracked bumper");
  assert.equal(page.reports[0]?.signatureDataUrl, undefined);
  assert.equal(toOfficeListReport(reports[0]).signatureDataUrl, undefined);
});
