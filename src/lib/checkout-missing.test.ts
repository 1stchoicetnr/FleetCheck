import assert from "node:assert/strict";
import test from "node:test";
import { outboxIsDue, scheduleOutboxFailure, type CheckoutOutboxItem } from "./checkout-idempotency.ts";
import {
  isDriverFixableOutboxError,
  missingCheckoutFieldLabels,
  missingCheckoutFieldsError,
  notSentValidationMessage,
  readCheckoutCreateFields,
} from "./checkout-missing.ts";
import { driverUploadMessage } from "./delivery-status.ts";
import { outboxLines, outboxProblem } from "./outbox-summary.ts";

function item(overrides: Partial<CheckoutOutboxItem> = {}): CheckoutOutboxItem {
  return {
    id: "chk-amber-talley",
    draftId: "draft-unit-11",
    attempts: 1,
    nextAttemptAt: new Date(0).toISOString(),
    createdAt: "2026-11-24T16:00:00.000Z",
    uploadedTokens: {},
    companyId: "company-rad-cab",
    vehicleId: "vehicle-11",
    unitNumber: "11",
    plate: "CYR3806",
    year: 2016,
    make: "Chrysler",
    model: "200",
    odometer: 153000,
    driverName: "Amanda Graves",
    dispatcherName: "",
    type: "check_out",
    photos: [],
    ...overrides,
  };
}

test("a create body names every missing required field", () => {
  assert.deepEqual(
    missingCheckoutFieldLabels({
      companyId: "company-rad-cab",
      vehicleId: "vehicle-11",
      unitNumber: "11",
      make: "",
      model: "200",
      driverName: "Amanda Graves",
      dispatcherName: "  ",
      year: Number.NaN,
      odometer: 0,
    }),
    ["make", "dispatcher", "year"]
  );
  assert.deepEqual(
    missingCheckoutFieldLabels({
      companyId: "company-rad-cab",
      vehicleId: "vehicle-11",
      unitNumber: "11",
      make: "Chrysler",
      model: "200",
      driverName: "Amanda Graves",
      dispatcherName: "Bell",
      year: 2016,
      odometer: 0,
    }),
    []
  );
  assert.deepEqual(
    readCheckoutCreateFields({
      companyId: " company-rad-cab ",
      vehicleId: "vehicle-11",
      unitNumber: "11",
      make: "Chrysler",
      model: "200",
      driverName: "Amanda Graves",
      dispatcherName: "Bell",
      year: "2016",
      odometer: 0,
    }),
    {
      companyId: "company-rad-cab",
      vehicleId: "vehicle-11",
      unitNumber: "11",
      make: "Chrysler",
      model: "200",
      driverName: "Amanda Graves",
      dispatcherName: "Bell",
      year: 2016,
      odometer: 0,
    }
  );
  assert.equal(readCheckoutCreateFields({ dispatcherName: "" }), null);
});

test("a stranded validation error tells the driver what is missing and how to fix it", () => {
  const message = missingCheckoutFieldsError(["dispatcher", "make"]);
  const failed = scheduleOutboxFailure(item(), Object.assign(new Error(message), { status: 400 }), 1_000);
  assert.equal(failed.permanent, true);
  assert.equal(outboxIsDue(failed, 1_000 + 60_000), false);

  const copy = notSentValidationMessage(failed.lastError);
  assert.equal(
    copy,
    "Not sent. Here's what's missing: dispatcher, make. Open the check and fill those in."
  );
  assert.equal(driverUploadMessage(message), copy);
  assert.equal(outboxProblem(failed, true).text, copy);
  assert.equal(isDriverFixableOutboxError(failed.lastError), true);

  const lines = outboxLines([failed], { signedIn: true, role: "driver" });
  assert.equal(lines[0]?.fixHref, "/checkout/draft-unit-11");
  assert.match(lines[0]?.problem ?? "", /Not sent\. Here's what's missing: dispatcher, make/);
});

test("a signature refusal is fixable and a server outage is not", () => {
  assert.match(notSentValidationMessage("Driver signature is required") ?? "", /signature/);
  assert.equal(notSentValidationMessage("Failed to save photo"), null);
  assert.equal(isDriverFixableOutboxError("The upload timed out."), false);
});
