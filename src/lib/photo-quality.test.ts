import assert from "node:assert/strict";
import test from "node:test";
import { needsSharpPhoto, photoQualityIssue } from "./photo-quality.ts";
import { isGenericDriverName } from "./driver-name.ts";

function fill(width: number, height: number, paint: (x: number, y: number) => [number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const offset = (y * width + x) * 4;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

test("a flat photo is blur and a washed-out photo is glare", () => {
  const blur = fill(16, 16, () => [120, 120, 120]);
  assert.equal(photoQualityIssue(blur, 16, 16), "blur");
  const glare = fill(16, 16, (x) => (x < 2 ? [0, 0, 0] : [255, 255, 255]));
  assert.equal(photoQualityIssue(glare, 16, 16), "glare");
  const sharp = fill(16, 16, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0] : [40, 40, 40]));
  assert.equal(photoQualityIssue(sharp, 16, 16), null);
});

test("only document and odometer slots are checked, and generic driver names are blocked", () => {
  assert.equal(needsSharpPhoto("odometer_fuel"), true);
  assert.equal(needsSharpPhoto("registration"), true);
  assert.equal(needsSharpPhoto("insurance"), true);
  assert.equal(needsSharpPhoto("windshield"), false);
  assert.equal(isGenericDriverName("Driver"), true);
  assert.equal(isGenericDriverName(" driver 2 "), true);
  assert.equal(isGenericDriverName("Ada Lovelace"), false);
});
