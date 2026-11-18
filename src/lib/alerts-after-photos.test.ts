import assert from "node:assert/strict";
import test from "node:test";
import { ALERT_PHOTO_WAIT_MS, alertsReady } from "./alert-timing.ts";
import { checkoutSlackText, missingPhotosSlackLine, sentMissingPhotoCount } from "./checkout-slack.ts";
import { toOfficeListReport } from "./office-list.ts";
import type { CheckoutReport, PhotoStep } from "./types.ts";

const created = "2026-11-17T20:00:00.000Z";
const t = Date.parse(created);

test("damage alerts wait for photos, the send, or 30 minutes", () => {
  assert.equal(alertsReady({ missingPhotos: 0, createdAt: created, now: t }), true);
  assert.equal(alertsReady({ missingPhotos: 5, createdAt: created, now: t + 60_000 }), false);
  assert.equal(alertsReady({ missingPhotos: 5, createdAt: created, now: t + ALERT_PHOTO_WAIT_MS - 1 }), false);
  assert.equal(alertsReady({ missingPhotos: 5, createdAt: created, now: t + ALERT_PHOTO_WAIT_MS }), true);
  assert.equal(alertsReady({ missingPhotos: 5, sentAt: created, createdAt: created, now: t }), true);
  assert.equal(alertsReady({ missingPhotos: 5, createdAt: "bad", now: t }), true);
});

const steps: PhotoStep[] = [
  { angle: "front", label: "Front", required: true },
  { angle: "rear", label: "Rear", required: true },
  { angle: "interior_front", label: "Interior", required: false },
] as unknown as PhotoStep[];

function report(photos: Array<{ angle: string; dataUrl: string }>, extra: Partial<CheckoutReport> = {}) {
  return {
    id: "1793975257814-f7oawda",
    idempotencyKey: "chk-abcdefgh12345",
    companyId: "company-rad-cab",
    vehicleId: "v11",
    unitNumber: "#11",
    plate: "CYR3806",
    year: 2016,
    make: "Chrysler",
    model: "200",
    odometer: 1000,
    driverName: "Ken Taylor",
    dispatcherName: "Bell",
    type: "check_out",
    status: "complete",
    completedAt: created,
    createdAt: created,
    sentAt: "2026-11-17T21:00:00.000Z",
    reviewStatus: "pending",
    flagged: false,
    synced: true,
    photos: photos.map((p) => ({ ...p, capturedAt: created })),
    ...extra,
  } as unknown as CheckoutReport;
}

test("a check sent without its required photos says so in Slack", () => {
  const none = report([]);
  assert.equal(sentMissingPhotoCount(none, steps), 2);
  assert.equal(sentMissingPhotoCount(none, undefined), 0);
  const text = checkoutSlackText(none, { appOrigin: "https://x.test", photoSteps: steps });
  assert.match(text, /Sent without photos:\* 2 required photos missing\. Office: follow up\./);
  const full = report([
    { angle: "front", dataUrl: "https://b/f.jpg" },
    { angle: "rear", dataUrl: "https://b/r.jpg" },
  ]);
  assert.doesNotMatch(checkoutSlackText(full, { photoSteps: steps }), /Sent without photos/);
  assert.equal(missingPhotosSlackLine(1), "*:warning: Sent without photos:* 1 required photo missing. Office: follow up.");
  assert.equal(missingPhotosSlackLine(0), null);
});

test("office list rows keep the missing-photo count but not the images", () => {
  const row = toOfficeListReport({ ...report([{ angle: "front", dataUrl: "stored" }]), missingPhotoCount: 1 });
  assert.equal(row.missingPhotoCount, 1);
  assert.equal(row.photos[0].dataUrl, "");
});
