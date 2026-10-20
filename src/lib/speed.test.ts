import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { median, pushSpeedSample, summarizeSpeed } from "./speed.ts";

test("speed samples keep a median for loads and screen changes", () => {
  assert.equal(median([]), null);
  assert.equal(median([9]), 9);
  assert.equal(median([4, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  const samples = pushSpeedSample(
    [
      { path: "/", kind: "load", ms: 800, at: 1 },
      { path: "/checkout", kind: "route", ms: 120, at: 2 },
    ],
    { path: "/office", kind: "route", ms: 80, at: 3 }
  );
  const summary = summarizeSpeed(samples);
  assert.equal(summary.loads, 1);
  assert.equal(summary.routes, 2);
  assert.equal(summary.loadMedianMs, 800);
  assert.equal(summary.routeMedianMs, 100);
  assert.equal(pushSpeedSample(Array.from({ length: 30 }, (_, i) => ({
    path: "/",
    kind: "route" as const,
    ms: i,
    at: i,
  })), { path: "/x", kind: "route", ms: 1, at: 99 }).length, 30);
});

test("the service worker cache version moved forward and caches the shell", () => {
  const sw = readFileSync(path.join(import.meta.dirname, "../../public/sw.js"), "utf8");
  assert.match(sw, /const CACHE_NAME = "inspekt-v6"/);
  assert.match(sw, /SHELL_CACHE = "inspekt-shell-v6"/);
  assert.match(sw, /STATIC_CACHE = "inspekt-static-v6"/);
  assert.doesNotMatch(sw, /inspekt-v5/);
  assert.match(sw, /request\.mode === "navigate"/);
  assert.match(sw, /_next\/static/);
  assert.match(sw, /isApi/);
});
