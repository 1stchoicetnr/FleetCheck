import assert from "node:assert/strict";
import test from "node:test";
import { blockerButtonLabel, checkoutBlockers } from "./checkout-blockers.ts";
import { closeUpAngle, missingCloseUps } from "./damage-closeup.ts";
import type { PhotoAngle } from "./types.ts";

const steps = [
  { angle: "odometer_fuel" as PhotoAngle, label: "Odometer & Fuel", required: true },
  { angle: "front" as PhotoAngle, label: "Front", required: true },
  { angle: "rear" as PhotoAngle, label: "Rear", required: true },
];
const allPhotos = { odometer_fuel: "a", front: "b", rear: "c" };
const base = {
  precheckOk: true,
  redPark: false,
  steps,
  photos: allPhotos,
  flags: {},
  precheckSlots: [] as PhotoAngle[],
  skipPhotos: false,
  photosReady: false,
  signed: true,
};

test("all done: nothing blocks submit", () => {
  assert.deepEqual(checkoutBlockers(base), []);
});

test("the stuck case: every photo taken, Precheck noted front damage, no close-up — it is named, not hidden", () => {
  const blockers = checkoutBlockers({ ...base, precheckSlots: ["front"], signed: false });
  assert.deepEqual(
    blockers.map((b) => b.kind),
    ["closeup", "signature"]
  );
  assert.equal(blockers[0].kind === "closeup" && blockers[0].angle, "front");
  assert.match(blockers[0].text, /Front damage: tap the car diagram and take the close-up/);
  assert.equal(blockerButtonLabel(blockers), "1 damage close-up left");
});

test("close-up taken but diagram not tapped still names the diagram", () => {
  const blockers = checkoutBlockers({
    ...base,
    photos: { ...allPhotos, [closeUpAngle("rear")]: "x" },
    flags: { rear: { flaggedDamage: true } },
  });
  assert.equal(blockers.length, 1);
  assert.match(blockers[0].text, /^Rear damage: tap the car diagram$/);
});

test("known damage answered Same needs no close-up", () => {
  const blockers = checkoutBlockers({
    ...base,
    precheckSlots: ["front"],
    flags: { front: { knownDamageAnswer: "same" } },
  });
  assert.deepEqual(blockers, []);
});

test("lists every damaged slot, not just the first", () => {
  const gaps = missingCloseUps(
    ["front", "rear"],
    { rear: { flaggedDamage: true } },
    allPhotos,
    ["front"]
  );
  assert.deepEqual(gaps.map((g) => g.angle), ["front", "rear"]);
  assert.equal(
    blockerButtonLabel(checkoutBlockers({ ...base, flags: { rear: { flaggedDamage: true } }, precheckSlots: ["front"] })),
    "2 damage close-ups left"
  );
});

test("missing photos and Precheck errors come first with the next photo named", () => {
  const blockers = checkoutBlockers({
    ...base,
    precheckOk: false,
    precheckError: "Fill required fields: Clover serial.",
    photos: { odometer_fuel: "a" },
  });
  assert.deepEqual(blockers.map((b) => b.kind), ["precheck", "photo"]);
  assert.equal(blockers[0].text, "Fill required fields: Clover serial.");
  assert.match(blockers[1].text, /2 photos left \(1\/3\)\. Next: Front/);
  assert.equal(blockerButtonLabel(blockers), "Finish Precheck first");
});

test("red park skips photos and close-ups, still needs the signature", () => {
  const blockers = checkoutBlockers({ ...base, redPark: true, photos: {}, precheckSlots: ["front"], signed: false });
  assert.deepEqual(blockers.map((b) => b.kind), ["signature"]);
});
