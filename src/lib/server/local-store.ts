import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { SEEDED_COMPANIES } from "@/lib/companies";
import { CheckoutReport } from "@/lib/types";
import { normalizePlate } from "@/lib/utils";
import {
  sharedRecoveredReports,
  sharedSeedReports,
  sharedSeedVehicles,
} from "./seed-shared";
import {
  ListVehiclesOptions,
  SharedStore,
  SharedVehicle,
  UpsertVehicleInput,
} from "./shared-types";

const STORE_PATH = path.join(process.cwd(), ".data", "shared.json");

let writeChain: Promise<void> = Promise.resolve();

async function readStore(): Promise<SharedStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as SharedStore;
  } catch {
    return { companies: [], vehicles: [], reports: [] };
  }
}

async function writeStore(store: SharedStore): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2));
}

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function loadAndSeedUnlocked(): Promise<SharedStore> {
  const store = await readStore();
  let changed = false;
  if (store.companies.length === 0) {
    store.companies = SEEDED_COMPANIES;
    changed = true;
  }
  const seedVehicles = sharedSeedVehicles();
  if (store.vehicles.length === 0) {
    store.vehicles = seedVehicles;
    changed = true;
  } else {
    const have = new Set(store.vehicles.map((v) => v.id));
    for (const vehicle of seedVehicles) {
      if (!have.has(vehicle.id)) {
        store.vehicles.push(vehicle);
        changed = true;
      }
    }
  }
  if (store.reports.length === 0) {
    store.reports = sharedSeedReports();
    changed = true;
  }
  const haveReports = new Set(store.reports.map((r) => r.id));
  for (const report of sharedRecoveredReports()) {
    if (!haveReports.has(report.id)) {
      store.reports.unshift(report);
      changed = true;
    }
  }
  if (changed) await writeStore(store);
  return store;
}

export async function localEnsureSeed(): Promise<SharedStore> {
  return enqueueWrite(() => loadAndSeedUnlocked());
}

export async function localListCompanies() {
  const store = await localEnsureSeed();
  return store.companies;
}

export async function localListVehicles(
  companyId?: string,
  options?: ListVehiclesOptions
): Promise<SharedVehicle[]> {
  const store = await localEnsureSeed();
  return store.vehicles.filter((v) => {
    if (companyId && v.companyId !== companyId) return false;
    if (!options?.includeArchived && v.archivedAt) return false;
    return true;
  });
}

export async function localGetVehicle(id: string): Promise<SharedVehicle | undefined> {
  const store = await localEnsureSeed();
  return store.vehicles.find((v) => v.id === id);
}

export async function localFindVehicleByPlate(
  companyId: string,
  plate: string
): Promise<SharedVehicle | undefined> {
  const store = await localEnsureSeed();
  const wanted = normalizePlate(plate);
  return store.vehicles.find(
    (v) =>
      v.companyId === companyId &&
      (normalizePlate(v.plate) === wanted || normalizePlate(v.unitNumber) === wanted)
  );
}

export async function localUpsertVehicle(
  input: UpsertVehicleInput
): Promise<SharedVehicle> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const plate = normalizePlate(input.plate);
    const existing = store.vehicles.find(
      (v) =>
        v.companyId === input.companyId &&
        (normalizePlate(v.plate) === plate ||
          normalizePlate(v.unitNumber) === plate)
    );
    const now = new Date().toISOString();
    const vehicle: SharedVehicle = {
      id: existing?.id ?? `vehicle-${input.companyId}-${plate.toLowerCase()}`,
      companyId: input.companyId,
      unitNumber: (input.unitNumber || existing?.unitNumber || plate).trim(),
      plate,
      make: input.make.trim(),
      model: input.model.trim(),
      year: Number(input.year),
      lastMileage: existing?.lastMileage,
      archivedAt: existing?.archivedAt,
      createdAt: existing?.createdAt ?? now,
    };
    if (existing) {
      const idx = store.vehicles.findIndex((v) => v.id === existing.id);
      store.vehicles[idx] = vehicle;
    } else {
      store.vehicles.push(vehicle);
    }
    await writeStore(store);
    return vehicle;
  });
}

export async function localSetVehicleArchived(
  id: string,
  archived: boolean
): Promise<SharedVehicle | undefined> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const idx = store.vehicles.findIndex((v) => v.id === id);
    if (idx < 0) return undefined;
    store.vehicles[idx] = {
      ...store.vehicles[idx],
      archivedAt: archived ? new Date().toISOString() : undefined,
    };
    if (!archived) delete store.vehicles[idx].archivedAt;
    await writeStore(store);
    return store.vehicles[idx];
  });
}

export async function localListReports(): Promise<CheckoutReport[]> {
  const store = await localEnsureSeed();
  return [...store.reports].sort(
    (a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
}

export async function localGetReport(id: string): Promise<CheckoutReport | undefined> {
  const store = await localEnsureSeed();
  return store.reports.find((r) => r.id === id);
}

export async function localPutReport(report: CheckoutReport): Promise<CheckoutReport> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const idx = store.reports.findIndex((r) => r.id === report.id);
    if (idx >= 0) store.reports[idx] = report;
    else store.reports.unshift(report);
    const vehicle = store.vehicles.find((v) => v.id === report.vehicleId);
    if (vehicle) vehicle.lastMileage = report.odometer;
    await writeStore(store);
    return report;
  });
}

export async function localPatchReport(
  id: string,
  patch: Partial<CheckoutReport>
): Promise<CheckoutReport | undefined> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const idx = store.reports.findIndex((r) => r.id === id);
    if (idx < 0) return undefined;
    store.reports[idx] = { ...store.reports[idx], ...patch };
    await writeStore(store);
    return store.reports[idx];
  });
}
