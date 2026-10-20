import assert from "node:assert/strict";
import test from "node:test";
import {
  markTourSeen,
  readTourSeen,
  tourAudience,
  tourIsSeen,
  tourSteps,
} from "./tour.ts";

test("drivers get four screens and office or owner get a shorter tour", () => {
  assert.equal(tourAudience({ role: "driver" }), "driver");
  assert.equal(tourAudience({ role: "driver", roleTitle: "Driver" }), "driver");
  assert.equal(tourSteps("driver").length, 4);
  assert.equal(tourAudience({ role: "management" }), "office");
  assert.equal(tourAudience({ role: "super_admin", roleTitle: "Owner" }), "office");
  assert.equal(tourAudience({ role: "tech", roleTitle: "Office" }), "office");
  assert.equal(tourSteps("office").length, 3);
  const copy = [...tourSteps("driver"), ...tourSteps("office")]
    .map((step) => `${step.title} ${step.body}`)
    .join(" ");
  assert.equal(/\bvan\b/i.test(copy), false);
  assert.match(copy, /Saved on phone/);
  assert.match(copy, /PIN/);
});

test("a finished tour stays finished until that person asks to see it again", () => {
  const seen = markTourSeen(readTourSeen(null), "user-driver", "driver");
  assert.equal(tourIsSeen(seen, "user-driver", "driver"), true);
  assert.equal(tourIsSeen(seen, "user-driver", "office"), false);
  assert.equal(tourIsSeen(seen, "user-ashley", "office"), false);
  const raw = JSON.stringify(seen);
  assert.deepEqual(readTourSeen(raw), seen);
  assert.deepEqual(readTourSeen("nope"), {});
});
