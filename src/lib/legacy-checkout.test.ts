import assert from "node:assert/strict";
import { test } from "node:test";
import { isStaleBuild } from "./build-version.ts";
import {
  isLegacyClientReport,
  legacyMissingNotes,
  photoStepsForClient,
  stuckReason,
  sweepShouldPostSlack,
} from "./legacy-checkout.ts";
import { missingRequiredPhotos } from "./checkout-completion.ts";
import type { PhotoStep } from "./types.ts";

const step = (angle: string, required = true) =>
  ({ angle, label: angle, instruction: "", icon: "", category: "exterior", required }) as PhotoStep;
const steps = [step("front"), step("insurance")];
const created = "2026-10-28T10:00:00.000Z";
const now = Date.parse("2026-10-28T12:00:00.000Z");
const photo = (angle: string) => ({ angle, dataUrl: "x", capturedAt: created }) as never;
const base = { createdAt: created, photos: [photo("front")], inspectionForm: undefined } as never as {
  createdAt: string;
  photos: never[];
  inspectionForm: undefined;
  idempotencyKey?: string;
  sentAt?: string;
  archivedAt?: string;
};

test("no idempotency key after Oct 20 is an old-app check", () => {
  assert.equal(isLegacyClientReport({ createdAt: created }), true);
  assert.equal(isLegacyClientReport({ createdAt: created, idempotencyKey: "k" }), false);
  assert.equal(isLegacyClientReport({ createdAt: "2026-10-01T00:00:00.000Z" }), false);
});

test("old-app checks treat insurance as optional and note it", () => {
  const legacySteps = photoStepsForClient(base, steps);
  assert.deepEqual(missingRequiredPhotos(base as never, legacySteps), []);
  assert.deepEqual(legacyMissingNotes(base as never, steps), ["Missing insurance photo (old app)"]);
  const current = { ...base, idempotencyKey: "k" };
  assert.deepEqual(missingRequiredPhotos(current as never, photoStepsForClient(current, steps)), ["insurance"]);
  assert.deepEqual(legacyMissingNotes(current as never, steps), []);
});

test("sweep posts to Slack only for checks under 24h old", () => {
  assert.equal(sweepShouldPostSlack(created, now), true);
  assert.equal(sweepShouldPostSlack(created, now + 25 * 3600_000), false);
});

test("stuck reason is specific", () => {
  assert.equal(stuckReason(base as never, steps, now), "Old app · never sent");
  assert.equal(stuckReason({ ...base, photos: [] } as never, steps, now), "Old app · 1 photo never uploaded");
  const current = { ...base, idempotencyKey: "k" };
  assert.equal(stuckReason(current as never, steps, now), "Missing 1 photo");
  assert.equal(stuckReason({ ...current, sentAt: created } as never, steps, now), undefined);
  assert.equal(stuckReason(base as never, steps, Date.parse(created) + 60_000), undefined);
});

test("stale build check ignores dev and missing values", () => {
  assert.equal(isStaleBuild("abc", "def"), true);
  assert.equal(isStaleBuild("abc", "abc"), false);
  assert.equal(isStaleBuild("dev", "def"), false);
  assert.equal(isStaleBuild("abc", undefined), false);
});
