import { AuthError } from "./auth-accounts";
import type { MemberRole } from "./member-role";
import {
  getVehicle,
  listFleetCompanies,
  listUserFleetIds,
  listVehicleIdsForFleets,
} from "./org-data";
import { openAuthDb, type RequestAuth } from "./request-auth";

export type FleetScope = { all: true } | { all: false; fleetIds: string[] };

/** Owners see every fleet. Office and Manager see only assigned fleets. */
export async function fleetScopeFor(auth: RequestAuth): Promise<FleetScope> {
  if (auth.role === "owner" || auth.source === "pin") return { all: true };
  if ((auth.role === "office" || auth.role === "manager") && auth.userId) {
    const fleetIds = await listUserFleetIds(await openAuthDb(), auth.orgId, auth.userId);
    return { all: false, fleetIds };
  }
  return { all: true };
}

export async function vehicleIdsInScope(auth: RequestAuth): Promise<string[] | null> {
  const scope = await fleetScopeFor(auth);
  if (scope.all) return null;
  if (scope.fleetIds.length === 0) return [];
  return listVehicleIdsForFleets(await openAuthDb(), auth.orgId, scope.fleetIds);
}

export async function companyIdsInScope(auth: RequestAuth): Promise<string[] | null> {
  const scope = await fleetScopeFor(auth);
  if (scope.all) return null;
  if (scope.fleetIds.length === 0) return [];
  const rows = await listFleetCompanies(await openAuthDb(), auth.orgId, scope.fleetIds);
  return [...new Set(rows.map((row) => String(row.company_id)))];
}

export async function assertVehicleInScope(auth: RequestAuth, vehicleId: string): Promise<void> {
  const scope = await fleetScopeFor(auth);
  if (scope.all) return;
  const vehicle = await getVehicle(await openAuthDb(), auth.orgId, vehicleId);
  const fleetId = vehicle?.fleet_id ? String(vehicle.fleet_id) : "";
  if (!fleetId || !scope.fleetIds.includes(fleetId)) {
    throw new AuthError("Not found", 404);
  }
}

export async function assertFleetInScope(auth: RequestAuth, fleetId: string): Promise<void> {
  const scope = await fleetScopeFor(auth);
  if (scope.all) return;
  if (!scope.fleetIds.includes(fleetId)) {
    throw new AuthError("That fleet is outside your fleets.", 403);
  }
}

/** Owners, and drivers with no assignments, stay unrestricted. Office and Manager do not. */
export async function fleetProfileForMember(
  orgId: string,
  userId: string,
  role: MemberRole
): Promise<{ fleetIds: string[]; companyIds: string[]; fleetScope: "all" | "assigned" }> {
  if (role === "owner") {
    return { fleetIds: [], companyIds: [], fleetScope: "all" };
  }
  const db = await openAuthDb();
  const fleetIds = await listUserFleetIds(db, orgId, userId);
  if (role === "driver" && fleetIds.length === 0) {
    return { fleetIds: [], companyIds: [], fleetScope: "all" };
  }
  const rows = fleetIds.length ? await listFleetCompanies(db, orgId, fleetIds) : [];
  return {
    fleetIds,
    companyIds: [...new Set(rows.map((row) => String(row.company_id)))],
    fleetScope: "assigned",
  };
}
