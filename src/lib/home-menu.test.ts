import assert from "node:assert/strict";
import test from "node:test";
import {
  canEditFleets,
  canReviewAccessRequests,
  canStartCheck,
  homeTiles,
  settingsPeopleActions,
  settingsSections,
  visibleMenuBadge,
} from "./home-menu.ts";

test("a driver sees the check, recent checks, and vehicles", () => {
  const user = { role: "driver", roleTitle: "Driver" };
  assert.equal(canStartCheck(user.role), true);
  assert.deepEqual(homeTiles(user), ["my-checks", "vehicles"]);
  assert.deepEqual(settingsSections(user), []);
});

test("office sees review, alerts, and vehicles, and not people or settings", () => {
  const user = { role: "management", roleTitle: "Office" };
  assert.equal(canStartCheck(user.role), true);
  assert.deepEqual(homeTiles(user), ["my-checks", "office", "alerts", "vehicles"]);
  assert.deepEqual(settingsSections(user), []);
});

test("a manager sees office work plus notifications and people, not company settings", () => {
  const user = { role: "management", roleTitle: "Manager" };
  assert.deepEqual(homeTiles(user), [
    "my-checks",
    "office",
    "alerts",
    "vehicles",
    "settings",
  ]);
  assert.deepEqual(settingsSections(user), ["notifications", "people"]);
  assert.deepEqual(settingsPeopleActions(user), ["invites"]);
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
  assert.deepEqual(settingsPeopleActions(user), ["users", "invites"]);
});

test("manager and owner review access requests, and office, driver, and tech do not", () => {
  assert.equal(canReviewAccessRequests({ role: "management", roleTitle: "Office" }), false);
  assert.equal(canReviewAccessRequests({ role: "management", roleTitle: "Manager" }), true);
  assert.equal(canReviewAccessRequests({ role: "super_admin", roleTitle: "Owner" }), true);
  assert.equal(canReviewAccessRequests({ role: "driver", roleTitle: "Driver" }), false);
  assert.deepEqual(settingsPeopleActions({ role: "management", roleTitle: "Office" }), []);
  assert.deepEqual(settingsPeopleActions({ role: "driver", roleTitle: "Driver" }), []);
  assert.equal(canReviewAccessRequests({ role: "tech", roleTitle: "Tech" }), false);
  assert.deepEqual(settingsSections({ role: "tech", roleTitle: "Tech" }), [
    "company",
    "notifications",
  ]);
});

test("manager and owner can edit fleets, and office, driver, and tech cannot", () => {
  assert.equal(canEditFleets({ role: "management", roleTitle: "Office" }), false);
  assert.equal(canEditFleets({ role: "management", roleTitle: "Manager" }), true);
  assert.equal(canEditFleets({ role: "super_admin", roleTitle: "Owner" }), true);
  assert.equal(canEditFleets({ role: "driver", roleTitle: "Driver" }), false);
  assert.equal(canEditFleets({ role: "tech", roleTitle: "Tech" }), false);
});

test("menu counts stay hidden at zero and show a positive total", () => {
  assert.equal(visibleMenuBadge(0), null);
  assert.equal(visibleMenuBadge(null), null);
  assert.equal(visibleMenuBadge(undefined), null);
  assert.equal(visibleMenuBadge(3), 3);
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
