import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutCompletionStatus,
  missingRequiredPhotos,
  sentBlockedByMissingPhotos,
  slackAlreadyHasCheckout,
} from "./checkout-completion.ts";
import { PHOTO_ANGLES, type PhotoStep } from "./types.ts";

const steps: PhotoStep[] = [
  { ...PHOTO_ANGLES[0], required: true },
  { ...PHOTO_ANGLES[1], required: false },
];

function withEnv(nodeEnv: string, run: () => void) {
  const previous = process.env.NODE_ENV;
  const flag = process.env.NEXT_PUBLIC_SKIP_PHOTOS;
  process.env.NODE_ENV = nodeEnv;
  process.env.NEXT_PUBLIC_SKIP_PHOTOS = "true";
  try {
    run();
  } finally {
    process.env.NODE_ENV = previous;
    if (flag === undefined) delete process.env.NEXT_PUBLIC_SKIP_PHOTOS;
    else process.env.NEXT_PUBLIC_SKIP_PHOTOS = flag;
  }
}

test("a new check stays uploading until each required photo is stored", () => {
  withEnv("production", () => {
    const missing = missingRequiredPhotos({ photos: [], inspectionForm: undefined }, steps);
    assert.deepEqual(missing, [steps[0].angle]);
    assert.equal(
      checkoutCompletionStatus("uploading", { photos: [], inspectionForm: undefined }, steps),
      "uploading"
    );
    const stored = checkoutCompletionStatus(
      "uploading",
      {
        photos: [
          { angle: steps[0].angle, dataUrl: "https://example.public.blob.vercel-storage.com/a.jpg", capturedAt: "2026-10-27T21:45:00.000Z" },
        ],
        inspectionForm: undefined,
      },
      steps
    );
    assert.equal(stored, "complete");
    const blank = checkoutCompletionStatus(
      "uploading",
      {
        photos: [{ angle: steps[0].angle, dataUrl: "  ", capturedAt: "2026-10-27T21:45:00.000Z" }],
        inspectionForm: undefined,
      },
      steps
    );
    assert.equal(blank, "uploading");
  });
});

test("an already complete check is left complete", () => {
  withEnv("production", () => {
    assert.equal(
      checkoutCompletionStatus("complete", { photos: [], inspectionForm: undefined }, steps),
      "complete"
    );
  });
});

test("a red precheck can be complete without photos", () => {
  withEnv("production", () => {
    const form = { trafficLight: "red", resultSource: "office" } as NonNullable<
      Parameters<typeof missingRequiredPhotos>[0]["inspectionForm"]
    >;
    assert.deepEqual(missingRequiredPhotos({ photos: [], inspectionForm: form }, steps), []);
    assert.equal(
      checkoutCompletionStatus(undefined, { photos: [], inspectionForm: form }, steps),
      "complete"
    );
  });
});

test("office can record sent without photos, and slack is not posted twice", () => {
  assert.equal(sentBlockedByMissingPhotos(false, 2), true);
  assert.equal(sentBlockedByMissingPhotos(true, 2), false);
  assert.equal(sentBlockedByMissingPhotos(false, 0), false);
  assert.equal(slackAlreadyHasCheckout("sent"), true);
  assert.equal(slackAlreadyHasCheckout("failed"), false);
  assert.equal(slackAlreadyHasCheckout(null), false);
});
