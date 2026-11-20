import assert from "node:assert/strict";
import test from "node:test";
import {
  baseAngleOf,
  cleanDamageSpot,
  closeUpAngle,
  closeUpMissing,
  damageSpotFields,
  damageSpotLabel,
  firstMissingCloseUp,
  isUploadAngle,
  needsCloseUp,
  precheckDamageSlots,
} from "./damage-closeup.ts";
import { beforeAfterPairs, beforeAfterSlackLines } from "./damage-before-after.ts";
import { outboxPhoto } from "./checkout-idempotency.ts";
import { photoAngleLabel, reportHasPhotoDamage } from "./photo-flags.ts";
import { damageItemKeys } from "./damage-keys.ts";

test("close-up photos are stored as closeup_<slot> and accepted for upload", () => {
  assert.equal(closeUpAngle("front"), "closeup_front");
  assert.equal(baseAngleOf("closeup_front"), "front");
  assert.equal(baseAngleOf("closeup_nope"), undefined);
  assert.equal(isUploadAngle("front"), true);
  assert.equal(isUploadAngle("closeup_driver_doors"), true);
  assert.equal(isUploadAngle("closeup_nope"), false);
  assert.equal(isUploadAngle("nope"), false);
  assert.equal(photoAngleLabel("closeup_front" as never), "Front close-up");
});

test("diagram spot: 0..1 only, rounded; labels by area", () => {
  assert.equal(cleanDamageSpot({ x: 1.2, y: 0.5 }), undefined);
  assert.equal(cleanDamageSpot({ x: "0.5", y: 0.5 }), undefined);
  assert.deepEqual(cleanDamageSpot({ x: 0.12345, y: 0.9 }), { x: 0.123, y: 0.9 });
  assert.deepEqual(damageSpotFields({ damageSpot: { x: 0.2, y: 0.1 } }), { damageSpot: { x: 0.2, y: 0.1 } });
  assert.deepEqual(damageSpotFields({}), {});
  assert.equal(damageSpotLabel({ x: 0.2, y: 0.1 }), "front left");
  assert.equal(damageSpotLabel({ x: 0.5, y: 0.9 }), "rear center");
  assert.equal(damageSpotLabel({ x: 0.9, y: 0.5 }), "middle right");
  assert.equal(damageSpotLabel({ x: 0.5, y: 0.5 }), "roof / center");
});

test("flagged damage, New damage, or Precheck damage needs a close-up; Same as before does not", () => {
  const slots = precheckDamageSlots({ damage: { front: "Bumper damage", marks: ["left"] } } as never);
  assert.deepEqual(slots, ["front", "driver_doors"]);
  assert.equal(needsCloseUp("rear", { flaggedDamage: true }, []), true);
  assert.equal(needsCloseUp("rear", { flaggedDamage: false }, []), false);
  assert.equal(needsCloseUp("front", undefined, slots), true);
  assert.equal(needsCloseUp("front", { knownDamageAnswer: "same" }, slots), false);
  assert.equal(needsCloseUp("front", { knownDamageAnswer: "new", flaggedDamage: true }, slots), true);
});

test("both the diagram tap and the close-up are required before moving on", () => {
  const photos: Record<string, string> = { front: "data:a", rear: "data:b" };
  assert.deepEqual(closeUpMissing("rear", { flaggedDamage: true }, photos, []), { spot: true, photo: true });
  assert.deepEqual(closeUpMissing("rear", { flaggedDamage: true, damageSpot: { x: 0.5, y: 0.9 } }, photos, []), { spot: false, photo: true });
  photos.closeup_rear = "data:c";
  assert.equal(closeUpMissing("rear", { flaggedDamage: true, damageSpot: { x: 0.5, y: 0.9 } }, photos, []), null);
  assert.equal(closeUpMissing("front", undefined, photos, []), null);
  assert.equal(
    firstMissingCloseUp(["front", "rear"], { front: { flaggedDamage: true } }, photos, []),
    "front"
  );
  assert.equal(firstMissingCloseUp(["front", "rear"], {}, { rear: "x" }, ["front"]), undefined, "slot not photographed yet");
});

test("the close-up becomes the after photo, with the diagram spot", () => {
  const report = {
    id: "r2",
    completedAt: "2026-11-21T15:00:00Z",
    driverName: "Ken Taylor",
    photos: [
      { angle: "front" as const, dataUrl: "https://blob/front.jpg", flaggedDamage: true, damageNote: "Bumper damage", damageSpot: { x: 0.3, y: 0.05 } },
      { angle: closeUpAngle("front"), dataUrl: "https://blob/closeup.jpg" },
    ],
  };
  const history = [{ id: "r1", completedAt: "2026-11-04T14:50:00Z", driverName: "Chris", photos: [{ angle: "front" as const, dataUrl: "https://blob/old.jpg" }] }];
  const [pair] = beforeAfterPairs(report, history, { keepStored: true });
  assert.equal(pair.angle, "front");
  assert.equal(pair.after?.stored, "https://blob/closeup.jpg");
  assert.match(pair.after?.src ?? "", /photos\/closeup_front/);
  assert.equal(pair.afterIsCloseUp, true);
  assert.deepEqual(pair.spot, { x: 0.3, y: 0.05 });
  assert.equal(pair.before?.reportId, "r1");
  const line = beforeAfterSlackLines([pair], (id) => `u/${id}`, (t) => t.slice(0, 10))[1];
  assert.equal(line, "• Front: <u/r1|Before · 2026-11-04 · Chris> | After: close-up on this check · front left");
  // The close-up is not a damage slot of its own.
  assert.deepEqual(damageItemKeys(report as never), ["front|bumper damage"]);
  assert.equal(reportHasPhotoDamage({ photos: [{ angle: closeUpAngle("front"), dataUrl: "x" }] } as never), false);
});

test("the spot rides along in the queued photo", () => {
  assert.deepEqual(outboxPhoto("front", "d", "t", { flaggedDamage: true, damageSpot: { x: 0.1, y: 0.2 } }).damageSpot, { x: 0.1, y: 0.2 });
  assert.equal(outboxPhoto("front", "d", "t", {}).damageSpot, undefined);
});
