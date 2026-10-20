import { normalizeFleetType } from "./types";

export interface SyncFleet {
  id: string;
  name: string;
  type: string;
  companyId: string;
  archivedAt?: string | null;
}

export interface SyncVehicle {
  id: string;
  fleetId?: string | null;
  companyId: string;
  unitNumber?: string | null;
  plate: string;
}

function compact(value: string | null | undefined): string {
  return (value || "").replace(/[\s-]/g, "").toUpperCase();
}

/** One server fleet for a phone fleet. Company and type must both match. */
export function serverFleetForLocal(
  local: SyncFleet,
  serverFleets: SyncFleet[]
): SyncFleet | null {
  const type = normalizeFleetType(local.type);
  const matches = serverFleets.filter(
    (fleet) =>
      fleet.companyId === local.companyId &&
      normalizeFleetType(fleet.type) === type &&
      !fleet.archivedAt
  );
  if (matches.length === 0) return null;
  return matches.find((fleet) => fleet.id === local.id) ?? matches[0];
}

function sameVehicle(local: SyncVehicle, server: SyncVehicle): boolean {
  if (local.companyId !== server.companyId) return false;
  const localKeys = [compact(local.plate), compact(local.unitNumber)].filter(Boolean);
  const serverKeys = [compact(server.plate), compact(server.unitNumber)].filter(Boolean);
  return localKeys.some((key) => serverKeys.includes(key));
}

export interface VehicleSyncItem {
  local: SyncVehicle;
  serverFleetId: string;
  serverVehicleId?: string;
}

export interface VehicleSyncPlan {
  upload: VehicleSyncItem[];
  already: VehicleSyncItem[];
  /** No server fleet yet, so the phone keeps the local row. */
  waiting: SyncVehicle[];
}

export function planVehicleSync(
  localVehicles: SyncVehicle[],
  serverVehicles: SyncVehicle[],
  localFleets: SyncFleet[],
  serverFleets: SyncFleet[]
): VehicleSyncPlan {
  const plan: VehicleSyncPlan = { upload: [], already: [], waiting: [] };
  const fleetsById = new Map(localFleets.map((fleet) => [fleet.id, fleet]));
  for (const local of localVehicles) {
    const localFleet = local.fleetId ? fleetsById.get(local.fleetId) : undefined;
    const companyFleets = serverFleets.filter(
      (fleet) => fleet.companyId === local.companyId && !fleet.archivedAt
    );
    const resolved = localFleet
      ? serverFleetForLocal(localFleet, serverFleets)
      : companyFleets.length === 1
        ? companyFleets[0]
        : null;
    if (!resolved) {
      plan.waiting.push(local);
      continue;
    }
    const match = serverVehicles.find((server) => sameVehicle(local, server));
    if (match) {
      plan.already.push({
        local,
        serverFleetId: resolved.id,
        serverVehicleId: match.id,
      });
    } else {
      plan.upload.push({ local, serverFleetId: resolved.id });
    }
  }
  return plan;
}

/**
 * Local fleet rows that duplicate a server fleet.
 * A row stays until every vehicle that pointed at it was confirmed on the server.
 */
export function localFleetsToDrop(
  localFleets: SyncFleet[],
  serverFleets: SyncFleet[],
  unconfirmedFleetIds: string[]
): string[] {
  const blocked = new Set(unconfirmedFleetIds);
  const drop: string[] = [];
  for (const local of localFleets) {
    if (serverFleets.some((fleet) => fleet.id === local.id)) continue;
    if (!serverFleetForLocal(local, serverFleets)) continue;
    if (blocked.has(local.id)) continue;
    drop.push(local.id);
  }
  return drop;
}

/** Fleet ids that still have a local vehicle the server has not confirmed. */
export function unconfirmedLocalFleetIds(
  localVehicles: SyncVehicle[],
  confirmedLocalVehicleIds: string[]
): string[] {
  const confirmed = new Set(confirmedLocalVehicleIds);
  const ids = new Set<string>();
  for (const vehicle of localVehicles) {
    if (!vehicle.fleetId) continue;
    if (!confirmed.has(vehicle.id)) ids.add(vehicle.fleetId);
  }
  return [...ids];
}
