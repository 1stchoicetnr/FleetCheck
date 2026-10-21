import { getVehicle } from "./checkout-repo";
import { AuthError } from "./auth-accounts";
import { listUserFleetIds } from "./org-data";
import { openAuthDb, type RequestAuth } from "./request-auth";
import { hasDatabaseUrl } from "./shared-config";

/** Empty assignments stay unrestricted so existing drivers keep their lists. */
export async function driverFleetAllowList(auth: RequestAuth): Promise<Set<string> | null> {
  if (auth.role !== "driver" || !auth.userId || !hasDatabaseUrl()) return null;
  const ids = await listUserFleetIds(await openAuthDb(), auth.orgId, auth.userId);
  if (ids.length === 0) return null;
  return new Set(ids);
}

export async function filterVehiclesForDriver<T extends { fleetId?: string }>(
  auth: RequestAuth,
  vehicles: T[]
): Promise<T[]> {
  const allowed = await driverFleetAllowList(auth);
  if (!allowed) return vehicles;
  return vehicles.filter((vehicle) => Boolean(vehicle.fleetId && allowed.has(vehicle.fleetId)));
}

export async function assertDriverMayCheckVehicle(
  auth: RequestAuth,
  vehicleId: string
): Promise<void> {
  const allowed = await driverFleetAllowList(auth);
  if (!allowed) return;
  const vehicle = await getVehicle(auth.orgId, vehicleId);
  if (!vehicle?.fleetId || !allowed.has(vehicle.fleetId)) {
    throw new AuthError("That unit is not in a fleet you can check.", 403);
  }
}
