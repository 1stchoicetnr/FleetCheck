import assert from "node:assert/strict";
import test from "node:test";
import { formatCheckoutTime } from "./checkout-slack.ts";
import type { BeforeAfterPair } from "./damage-before-after.ts";
import {
  beforeAfterViewerSlides,
  changeBoxStyle,
  coverImageRect,
  photoCheckViewerSlides,
  viewerSlides,
  type PhotoCheckView,
} from "./photo-viewer.ts";

const BOX = { x: 0.12, y: 0.34, w: 0.2, h: 0.15 };
const BEFORE_SRC = "/api/checkout-reports/prior-1/photos/lf_corner";
const AFTER_SRC = "/api/checkout-reports/check-9/photos/lf_corner";

function finding(extra: Partial<PhotoCheckView> = {}): PhotoCheckView {
  return {
    angle: "lf_corner",
    label: "Front 3/4 Left",
    box: BOX,
    before: {
      src: BEFORE_SRC,
      completedAt: "2026-11-01T20:04:00.000Z",
      driverName: "Sam Rivera",
    },
    after: {
      src: AFTER_SRC,
      completedAt: "2026-11-27T18:00:00.000Z",
      driverName: "Alex Chen",
    },
    ...extra,
  };
}

test("a photo-check finding opens only its before and new photos", () => {
  const slides = photoCheckViewerSlides(finding());
  const other = photoCheckViewerSlides(
    finding({
      angle: "rear",
      label: "Rear",
      before: {
        src: "/api/checkout-reports/prior-1/photos/rear",
        completedAt: "2026-10-01T15:00:00.000Z",
        driverName: "Pat",
      },
      after: {
        src: "/api/checkout-reports/check-9/photos/rear",
        completedAt: "2026-11-27T18:00:00.000Z",
        driverName: "Alex Chen",
      },
    })
  );

  assert.deepEqual(
    slides.map((slide) => slide.id),
    ["lf_corner:before", "lf_corner:new"]
  );
  assert.deepEqual(
    slides.map((slide) => slide.label),
    [`Before (${formatCheckoutTime("2026-11-01T20:04:00.000Z")}, Sam Rivera)`, "New"]
  );
  assert.equal(slides[0]?.kicker, "Front 3/4 Left");
  assert.equal(slides[1]?.kicker, "Front 3/4 Left");
  assert.equal(slides[0]?.box, undefined);
  assert.deepEqual(slides[1]?.box, BOX);
  assert.equal(slides[0]?.src, BEFORE_SRC);
  assert.equal(slides[1]?.src, AFTER_SRC);
  assert.equal(other.some((slide) => slide.src === AFTER_SRC), false);
  assert.equal(slides.some((slide) => slide.id.startsWith("rear")), false);
});

test("photo-check slides keep the authorized photo address", () => {
  const slides = photoCheckViewerSlides(finding());
  for (const slide of slides) {
    assert.equal(slide.src.startsWith("/api/checkout-reports/"), true);
    assert.equal(slide.src.includes("blob.vercel-storage.com"), false);
  }
});

test("a finding with no earlier photo opens only New, still boxed", () => {
  const slides = photoCheckViewerSlides(finding({ before: undefined }));
  assert.equal(slides.length, 1);
  assert.equal(slides[0]?.id, "lf_corner:new");
  assert.equal(slides[0]?.label, "New");
  assert.deepEqual(slides[0]?.box, BOX);
});

test("a missing highlight is not invented", () => {
  const slides = photoCheckViewerSlides(finding({ box: undefined }));
  assert.equal(slides[1]?.box, undefined);
});

test("empty photo addresses are left out of the viewer", () => {
  const slides = viewerSlides([
    { id: "a", src: "", label: "Before" },
    { id: "b", src: AFTER_SRC, label: "New", box: BOX },
  ]);
  assert.deepEqual(
    slides.map((slide) => slide.id),
    ["b"]
  );
});

test("the damage box uses the same fractions as the thumbnail", () => {
  assert.deepEqual(changeBoxStyle(BOX), {
    left: "12%",
    top: "34%",
    width: "20%",
    height: "15%",
  });
  assert.deepEqual(changeBoxStyle({ x: 200, y: 340, w: 200, h: 150 }), {
    left: "20%",
    top: "34%",
    width: "20%",
    height: "15%",
  });
});

test("object-fit cover places the full photo, cropped evenly, behind the box", () => {
  assert.deepEqual(coverImageRect(400, 300, 320, 180), { left: 0, top: -30, width: 320, height: 240 });
  assert.deepEqual(coverImageRect(100, 200, 180, 180), { left: 0, top: -90, width: 180, height: 360 });
  assert.equal(coverImageRect(0, 10, 10, 10), null);
});

test("damage before/after opens one slot, with the existing captions", () => {
  const pair: BeforeAfterPair = {
    angle: "front",
    label: "Front",
    before: {
      reportId: "prior-1",
      src: "/api/checkout-reports/prior-1/photos/front",
      completedAt: "2026-11-01T20:04:00.000Z",
      driverName: "Sam Rivera",
    },
    after: {
      reportId: "check-9",
      src: "/api/checkout-reports/check-9/photos/front",
      completedAt: "2026-11-27T18:00:00.000Z",
      driverName: "Alex Chen",
    },
  };
  const slides = beforeAfterViewerSlides(pair);
  assert.deepEqual(
    slides.map((slide) => slide.label),
    [
      `Before · ${formatCheckoutTime(pair.before!.completedAt)} · Sam Rivera`,
      "After · this check",
    ]
  );
  assert.equal(slides[0]?.src, pair.before?.src);
  assert.equal(slides[1]?.src, pair.after?.src);

  const closeUp = beforeAfterViewerSlides({ ...pair, before: undefined, afterIsCloseUp: true });
  assert.deepEqual(
    closeUp.map((slide) => slide.label),
    ["After · close-up, this check"]
  );
  assert.equal(closeUp[0]?.src.includes("blob.vercel-storage.com"), false);
});
