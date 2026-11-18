import assert from "node:assert/strict";
import test from "node:test";
import { driverMayAddPhotos } from "./photo-window.ts";

const created = "2026-11-17T14:00:00.000Z";
const later = Date.parse("2026-11-18T08:00:00.000Z");

test("inside 6 hours any photo is accepted", () => {
  assert.equal(driverMayAddPhotos({ createdAt: created }, ["2026-11-17T15:00:00Z"], Date.parse(created) + 60_000), true);
});

test("a phone that held its photos offline can still send them to the unsent check", () => {
  assert.equal(driverMayAddPhotos({ createdAt: created }, ["2026-11-17T13:58:00Z", "2026-11-17T14:05:00Z"], later), true);
});

test("new photos on an old check, or on a sent one, are still refused", () => {
  assert.equal(driverMayAddPhotos({ createdAt: created }, ["2026-11-18T07:59:00Z"], later), false);
  assert.equal(driverMayAddPhotos({ createdAt: created, sentAt: "2026-11-17T14:10:00Z" }, ["2026-11-17T13:58:00Z"], later), false);
  assert.equal(driverMayAddPhotos({ createdAt: created }, [undefined], later), false);
});
