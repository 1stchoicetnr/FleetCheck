import assert from "node:assert/strict";
import test from "node:test";
import { PHOTO_ANGLES } from "./types.ts";
import { framingForAngle, outlineShapes, type FramingKind } from "./photo-guides.ts";

const KINDS: FramingKind[] = [
  "front",
  "rear",
  "side",
  "corner",
  "wheel",
  "panel",
  "odometer",
  "cabin",
  "windshield",
  "document",
  "engine",
  "controls",
];

test("every photo angle has a generic outline and a short tip", () => {
  const used = new Set<FramingKind>();
  for (const step of PHOTO_ANGLES) {
    const guide = framingForAngle(step.angle);
    used.add(guide.kind);
    assert.ok(KINDS.includes(guide.kind), step.angle);
    assert.ok(guide.tip.length > 12, step.angle);
    assert.ok(guide.tip.length < 120, step.angle);
    assert.equal(/\bvan\b/i.test(guide.tip), false, guide.tip);
    assert.ok(outlineShapes(guide.kind).length > 0);
  }
  assert.ok(used.has("front"));
  assert.ok(used.has("rear"));
  assert.ok(used.has("side"));
  assert.ok(used.has("corner"));
  assert.ok(used.has("odometer"));
  assert.ok(used.has("cabin"));
  assert.ok(used.has("wheel"));
});
