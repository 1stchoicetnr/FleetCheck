import assert from "node:assert/strict";
import test from "node:test";
import { canEditFleets, canStartCheck, homeTiles, settingsSections } from "./home-menu.ts";

test("a driver sees the check, recent checks, and vehicles", () => {
  const user = { role: "driver", roleTitle: "Driver" };
  assert.equal(canStartCheck(user.role), true);
  assert.deepEqual(homeTiles(user), ["my-checks", "vehicles"]);
  assert.deepEqual(settingsSections(user), []);
});

test("office sees review, alerts, vehicles, and settings without people", () => {
  const user = { role: "management", roleTitle: "Office" };
  assert.equal(canStartCheck(user.role), true);
  assert.deepEqual(homeTiles(user), [
    "my-checks",
    "office",
    "alerts",
    "vehicles",
    "settings",
  ]);
  assert.deepEqual(settingsSections(user), ["company", "notifications"]);
});

test("an owner sees every daily tile and all three settings sections", () => {
  const user = { role: "super_admin", roleTitle: "Owner" };
  assert.deepEqual(homeTiles(user), [
    "my-checks",
    "office",
    "alerts",
    "vehicles",
    "settings",
  ]);
  assert.deepEqual(settingsSections(user), [
    "company",
    "notifications",
    "people",
  ]);
});

test("office and owner can edit fleets, and driver and tech cannot", () => {
  assert.equal(canEditFleets({ role: "management", roleTitle: "Office" }), true);
  assert.equal(canEditFleets({ role: "super_admin", roleTitle: "Owner" }), true);
  assert.equal(canEditFleets({ role: "driver", roleTitle: "Driver" }), false);
  assert.equal(canEditFleets({ role: "tech", roleTitle: "Tech" }), false);
});

test("tech keeps review, alerts, vehicles, settings, and issue reports", () => {
  const user = { role: "tech", roleTitle: "Tech" };
  assert.equal(canStartCheck(user.role), false);
  assert.deepEqual(homeTiles(user), [
    "my-checks",
    "office",
    "alerts",
    "vehicles",
    "settings",
    "reports",
  ]);
});
