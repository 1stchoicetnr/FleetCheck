import assert from "node:assert/strict";
import test from "node:test";
import {
  isLibraryPhoto,
  odometerReadingMatches,
} from "./odometer-match.ts";
import { photoStampLabel } from "./photo-stamp.ts";
import { damageFlagText, damageSideLine } from "./photo-flags.ts";
import { photoQualityIssue } from "./photo-quality.ts";

function fill(
  width: number,
  height: number,
  paint: (x: number, y: number) => [number, number, number]
) {
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

test("dark, blank, and blurry photos are rejected", () => {
  const blank = fill(16, 16, () => [120, 120, 120]);
  assert.equal(photoQualityIssue(blank, 16, 16), "blank");
  const dark = fill(16, 16, (x, y) =>
    (x + y) % 2 === 0 ? [2, 2, 2] : [28, 28, 28]
  );
  assert.equal(photoQualityIssue(dark, 16, 16), "dark");
  const blur = fill(16, 16, (x) => {
    const v = 60 + x * 5;
    return [v, v, v];
  });
  assert.equal(photoQualityIssue(blur, 16, 16), "blur");
});

test("the odometer photo has to contain the typed mileage", () => {
  assert.equal(odometerReadingMatches(145900, "145900"), true);
  assert.equal(odometerReadingMatches("145,900", "trip 145900 8"), true);
  assert.equal(odometerReadingMatches(145900, "14590"), false);
  assert.equal(odometerReadingMatches(145900, ""), false);
  assert.equal(odometerReadingMatches("", "145900"), false);
});

test("a library file is older than a live camera file", () => {
  const now = 1_000_000;
  assert.equal(isLibraryPhoto(now - 10_000, now), false);
  assert.equal(isLibraryPhoto(now - 10 * 60 * 1000, now), true);
  assert.equal(isLibraryPhoto(0, now), false);
});

test("a capture stamp uses Pacific time", () => {
  assert.equal(photoStampLabel("2026-10-21T19:40:00.000Z"), "Oct 21, 2026, 12:40 PM PT");
});

test("damage marks always name the driver", () => {
  assert.equal(
    damageFlagText({ angle: "front", damageNote: " cracked bumper " }, "Ada Lovelace"),
    "Front · Ada Lovelace: cracked bumper"
  );
  assert.equal(damageSideLine("Left", "scrape", "Ada Lovelace"), "Left · Ada Lovelace: scrape");
  assert.equal(damageSideLine("Rear", undefined, "Ada Lovelace"), "Rear · Ada Lovelace: marked");
});
