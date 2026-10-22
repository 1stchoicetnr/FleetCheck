import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLE_DETAILS,
  accessRank,
  canEditCompanySettings,
  canEditFleetNotifications,
  canEditVehicles,
  canGrantMemberRole,
  canManagePeople,
  fleetsStayInside,
  managerCanSeePerson,
  roleChoices,
} from "./role-access.ts";

test("manager sits between office and owner, and office stays office", () => {
  assert.equal(accessRank({ role: "management", roleTitle: "Office" }), "office");
  assert.equal(accessRank({ role: "management", roleTitle: "Manager" }), "manager");
  assert.equal(accessRank({ role: "super_admin", roleTitle: "Owner" }), "owner");
  assert.equal(accessRank({ role: "driver", roleTitle: "Driver" }), "driver");
  assert.equal(canEditVehicles({ role: "management", roleTitle: "Office" }), false);
  assert.equal(canEditVehicles({ role: "management", roleTitle: "Manager" }), true);
  assert.equal(canManagePeople({ role: "management", roleTitle: "Office" }), false);
  assert.equal(canManagePeople({ role: "management", roleTitle: "Manager" }), true);
  assert.equal(canEditCompanySettings({ role: "management", roleTitle: "Manager" }), false);
  assert.equal(canEditCompanySettings({ role: "super_admin", roleTitle: "Owner" }), true);
  assert.equal(canEditFleetNotifications({ role: "management", roleTitle: "Office" }), false);
  assert.equal(canEditFleetNotifications({ role: "management", roleTitle: "Manager" }), true);
});

test("a manager can grant driver, office, and manager, and never owner", () => {
  assert.deepEqual(roleChoices(false), ["driver", "office", "manager"]);
  assert.deepEqual(roleChoices(true), ["driver", "office", "manager", "owner"]);
  assert.equal(canGrantMemberRole("manager", "manager"), true);
  assert.equal(canGrantMemberRole("manager", "owner"), false);
  assert.equal(canGrantMemberRole("office", "driver"), false);
  assert.equal(canGrantMemberRole("owner", "owner"), true);
  assert.match(ROLE_DETAILS.manager, /assigned fleets/);
  assert.match(ROLE_DETAILS.office, /views vehicles/);
});

test("a manager cannot see owners or people on another fleet", () => {
  assert.equal(managerCanSeePerson("owner", ["fleet-rad"], ["fleet-rad"]), false);
  assert.equal(managerCanSeePerson("driver", ["fleet-rad", "fleet-turo"], ["fleet-rad"]), false);
  assert.equal(managerCanSeePerson("office", ["fleet-rad"], ["fleet-rad"]), true);
  assert.equal(managerCanSeePerson("driver", [], ["fleet-rad"]), false);
  assert.equal(fleetsStayInside(["fleet-rad"], ["fleet-rad"]), true);
  assert.equal(fleetsStayInside(["fleet-rad"], ["fleet-turo"]), false);
  assert.equal(fleetsStayInside(null, ["fleet-turo"]), true);
});
