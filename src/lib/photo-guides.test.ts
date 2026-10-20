import assert from "node:assert/strict";
import test from "node:test";
import { PHOTO_ANGLES } from "./types.ts";
import { framingForAngle, outlineShapes } from "./photo-guides.ts";

const CORNER_ANGLES = [
  "odometer_fuel",
  "windshield",
  "radio_climate",
  "registration",
  "driver_door_in",
  "trunk_interior",
  "engine_oil",
  "lf_wheel",
  "lf_fender",
  "driver_doors",
  "lf_corner",
];

test("interior and close-up angles use corner marks, not a diagram", () => {
  for (const angle of CORNER_ANGLES) {
    const guide = framingForAngle(angle as (typeof PHOTO_ANGLES)[number]["angle"]);
    assert.equal(guide.style, "corners", angle);
    assert.equal(/\b(box|outline|van)\b/i.test(guide.tip), false, guide.tip);
  }
  const odometer = framingForAngle("odometer_fuel");
  assert.match(odometer.tip, /mileage/);
});

test("only the front and rear keep a thin silhouette", () => {
  for (const step of PHOTO_ANGLES) {
    const guide = framingForAngle(step.angle);
    assert.ok(guide.tip.length > 12 && guide.tip.length < 120, step.angle);
    assert.equal(/\bvan\b/i.test(guide.tip), false, guide.tip);
    if (guide.style === "silhouette") {
      assert.ok(guide.kind === "front" || guide.kind === "rear");
      const shapes = outlineShapes(guide.kind);
      assert.ok(shapes.length > 0);
      assert.ok(shapes.every((shape) => shape.d && !shape.r));
    } else {
      assert.equal(guide.style, "corners");
    }
  }
  assert.equal(framingForAngle("front").style, "silhouette");
  assert.equal(framingForAngle("rear").kind, "rear");
  assert.equal(framingForAngle("driver_doors").style, "corners");
  assert.equal(framingForAngle("passenger_doors").style, "corners");
  assert.equal(framingForAngle("lf_corner").style, "corners");
  assert.equal(framingForAngle("odometer_fuel").style, "corners");
  assert.equal(outlineShapes("front").some((shape) => shape.r), false);
  assert.equal(outlineShapes("rear").some((shape) => shape.r), false);
});
