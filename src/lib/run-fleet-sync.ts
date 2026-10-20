import { fetchFleets, fetchVehicles, upsertSharedVehicle } from "./checkout-api";
import {
  localFleetsToDrop,
  planVehicleSync,
  unconfirmedLocalFleetIds,
  type SyncFleet,
} from "./fleet-sync";
import {
  deleteLocalFleet,
  getFleets,
  getVehicles,
  saveFleet,
  saveVehicle,
} from "./storage";
import { normalizeFleetType, type Fleet } from "./types";

const SYNC_KEY = "fleetcheck-fleet-sync-v1";

export interface FleetSyncReport {
  uploaded: string[];
  matched: string[];
  kept: string[];
  droppedFleets: number;
  offline: boolean;
}

let inflight: Promise<FleetSyncReport> | null = null;

function emptyReport(offline: boolean): FleetSyncReport {
  return { uploaded: [], matched: [], kept: [], droppedFleets: 0, offline };
}

function asSyncFleet(fleet: {
  id: string;
  name: string;
  type: string;
  companyId: string;
  archivedAt?: string | null;
}): SyncFleet {
  return {
    id: fleet.id,
    name: fleet.name,
    type: fleet.type,
    companyId: fleet.companyId,
    archivedAt: fleet.archivedAt,
  };
}

/**
 * First sync copies phone fleets onto the server fleets and uploads vehicles
 * the server does not already have. Local rows stay until that upload is confirmed.
 */
export function runFleetSync(): Promise<FleetSyncReport> {
  if (typeof window === "undefined") return Promise.resolve(emptyReport(false));
  try {
    const cached = localStorage.getItem(SYNC_KEY);
    if (cached && (JSON.parse(cached) as { done?: boolean }).done) {
      return Promise.resolve(emptyReport(false));
    }
  } catch {
    // A bad cache must not block a real sync.
  }
  if (inflight) return inflight;
  inflight = execute().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function execute(): Promise<FleetSyncReport> {
  const localFleets = await getFleets();
  const localVehicles = await getVehicles();
  let serverFleets;
  let serverVehicles;
  try {
    serverFleets = await fetchFleets({ includeArchived: true });
    const companyIds = new Set<string>();
    for (const fleet of serverFleets) companyIds.add(fleet.companyId);
    for (const vehicle of localVehicles) {
      if (vehicle.companyId) companyIds.add(vehicle.companyId);
    }
    const lists = await Promise.all(
      [...companyIds].map((companyId) =>
        fetchVehicles(companyId, { includeArchived: true })
      )
    );
    serverVehicles = lists.flat().map((vehicle) => ({
      id: vehicle.id,
      fleetId: vehicle.fleetId,
      companyId: vehicle.companyId,
      unitNumber: vehicle.unitNumber,
      plate: vehicle.plate,
    }));
  } catch {
    return emptyReport(true);
  }

  const localSyncVehicles = localVehicles.map((vehicle) => ({
    id: vehicle.id,
    fleetId: vehicle.fleetId,
    companyId: vehicle.companyId,
    unitNumber: vehicle.unitNumber,
    plate: vehicle.plate,
  }));
  const plan = planVehicleSync(
    localSyncVehicles,
    serverVehicles,
    localFleets.map(asSyncFleet),
    serverFleets.map(asSyncFleet)
  );

  const confirmed = new Set<string>();
  const fleetForLocal = new Map<string, string>();
  const uploaded: string[] = [];
  const matched: string[] = [];
  let failed = false;

  for (const item of plan.already) {
    confirmed.add(item.local.id);
    fleetForLocal.set(item.local.id, item.serverFleetId);
    matched.push(item.local.plate);
  }

  for (const item of plan.upload) {
    const vehicle = localVehicles.find((row) => row.id === item.local.id);
    if (!vehicle) {
      failed = true;
      continue;
    }
    const serverFleet = serverFleets.find((fleet) => fleet.id === item.serverFleetId);
    try {
      const saved = await upsertSharedVehicle({
        companyId: serverFleet?.companyId || vehicle.companyId,
        fleetId: item.serverFleetId,
        unitNumber: vehicle.unitNumber?.trim() || vehicle.plate,
        plate: vehicle.plate,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
      });
      confirmed.add(vehicle.id);
      fleetForLocal.set(vehicle.id, saved.fleetId || item.serverFleetId);
      uploaded.push(`Unit ${saved.unitNumber} ${saved.plate}`);
    } catch {
      failed = true;
    }
  }

  for (const vehicle of localVehicles) {
    const nextFleetId = fleetForLocal.get(vehicle.id);
    if (!nextFleetId || vehicle.fleetId === nextFleetId) continue;
    await saveVehicle({ ...vehicle, fleetId: nextFleetId });
  }

  for (const fleet of serverFleets) {
    const cached: Fleet = {
      id: fleet.id,
      name: fleet.name,
      type: normalizeFleetType(fleet.type),
      companyId: fleet.companyId,
      createdAt: fleet.createdAt,
    };
    if (fleet.archivedAt) cached.archivedAt = fleet.archivedAt;
    await saveFleet(cached);
  }

  const blocked = unconfirmedLocalFleetIds(localSyncVehicles, [...confirmed]);
  const dropIds = localFleetsToDrop(
    localFleets.map(asSyncFleet),
    serverFleets.map(asSyncFleet),
    blocked
  );
  for (const id of dropIds) await deleteLocalFleet(id);

  if (!failed && plan.waiting.length === 0) {
    localStorage.setItem(SYNC_KEY, JSON.stringify({ done: true }));
  }
  return {
    uploaded,
    matched,
    kept: plan.waiting.map((vehicle) => vehicle.plate),
    droppedFleets: dropIds.length,
    offline: false,
  };
}
