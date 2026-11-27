import assert from "node:assert/strict";
import test from "node:test";
import { boxForDisplayedOrientation, normalizeChangeBox } from "./photo-box.ts";

const panel = { x: 0.55, y: 0.35, w: 0.2, h: 0.15 };

test("a 0-1 box is unchanged, and a 0-1000 box becomes a fraction of the photo", () => {
  assert.deepEqual(normalizeChangeBox(panel), panel);
  assert.deepEqual(normalizeChangeBox({ x: 550, y: 350, w: 200, h: 150 }), panel);
  assert.deepEqual(normalizeChangeBox(normalizeChangeBox(panel)), panel);
});

test("Gemini ymin/xmin/ymax/xmax, including a 0-1000 array, becomes left/top/width/height", () => {
  const expected = { x: 0.2, y: 0.4, w: 0.3, h: 0.3 };
  assert.deepEqual(normalizeChangeBox([400, 200, 700, 500]), expected);
  assert.deepEqual(
    normalizeChangeBox({ ymin: 0.4, xmin: 0.2, ymax: 0.7, xmax: 0.5 }),
    expected
  );
});

test("corner pairs and a box stored as right/bottom edges shrink to the damage", () => {
  assert.deepEqual(normalizeChangeBox({ x1: 0.55, y1: 0.35, x2: 0.75, y2: 0.5 }), panel);
  assert.deepEqual(normalizeChangeBox({ x: 0.55, y: 0.35, w: 0.8, h: 0.7 }), {
    x: 0.55,
    y: 0.35,
    w: 0.25,
    h: 0.35,
  });
});

test("a degenerate box or a box over the whole photo is dropped", () => {
  assert.equal(normalizeChangeBox({ x: 0.1, y: 0.1, w: 0, h: 0.2 }), undefined);
  assert.equal(normalizeChangeBox({ x: 0, y: 0, w: 1, h: 1 }), undefined);
  assert.equal(normalizeChangeBox(null), undefined);
  assert.equal(normalizeChangeBox([1, 2]), undefined);
});

test("EXIF orientation moves a raw-pixel box onto the upright photo", () => {
  const raw = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
  assert.deepEqual(boxForDisplayedOrientation(raw, 1), raw);
  assert.deepEqual(boxForDisplayedOrientation(raw, 6), { x: 0.4, y: 0.1, w: 0.4, h: 0.3 });
  assert.deepEqual(boxForDisplayedOrientation(raw, 8), { x: 0.2, y: 0.6, w: 0.4, h: 0.3 });
  assert.deepEqual(boxForDisplayedOrientation(raw, 3), { x: 0.6, y: 0.4, w: 0.3, h: 0.4 });
  assert.deepEqual(boxForDisplayedOrientation(raw, 0), raw);
});
