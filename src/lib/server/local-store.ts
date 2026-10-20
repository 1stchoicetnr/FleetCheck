import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { SEEDED_COMPANIES } from "@/lib/companies";
import { CheckoutReport } from "@/lib/types";
import { inferPowertrain } from "@/lib/inspection-form";
import { displayPlate, normalizePlate } from "@/lib/utils";
import {
  sharedRecoveredReports,
  sharedSeedReports,
  sharedSeedVehicles,
} from "./seed-shared";
import {
  ListVehiclesOptions,
  SharedAppUser,
  SharedOfficeAlert,
  SharedStore,
  SharedVehicle,
  UpsertVehicleInput,
} from "./shared-types";
import { SEEDED_APP_USERS } from "./seed-users";
import {
  FleetSettings,
  DEFAULT_FLEET_SETTINGS,
} from "@/lib/fleet-settings";

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
  if (!store.users?.length) {
    store.users = SEEDED_APP_USERS;
    changed = true;
  }
  if (changed) await writeStore(store);
  return store;
}

export async function localListUsers(): Promise<SharedAppUser[]> {
  const store = await localEnsureSeed();
  return [...(store.users ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

export async function localInsertUser(user: SharedAppUser): Promise<SharedAppUser> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    store.users = store.users ?? [];
    if (store.users.some((item) => item.email.toLowerCase() === user.email.toLowerCase())) {
      throw new Error("A user with that email already exists");
    }
    store.users.push(user);
    await writeStore(store);
    return user;
  });
}

export async function localUpdateUser(
  id: string,
  patch: Partial<Pick<SharedAppUser, "name" | "email" | "role" | "active">>
): Promise<SharedAppUser | undefined> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const users = store.users ?? [];
    const idx = users.findIndex((user) => user.id === id);
    if (idx < 0) return undefined;
    const next: SharedAppUser = {
      ...users[idx],
      name: patch.name?.trim() || users[idx].name,
      email: patch.email?.trim().toLowerCase() || users[idx].email,
      role: patch.role || users[idx].role,
      active: typeof patch.active === "boolean" ? patch.active : users[idx].active,
    };
    users[idx] = next;
    store.users = users;
    await writeStore(store);
    return next;
  });
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
    const plateKey = normalizePlate(input.plate);
    const plate = displayPlate(input.plate);
    const existing = store.vehicles.find(
      (v) =>
        v.companyId === input.companyId &&
        (normalizePlate(v.plate) === plateKey ||
          normalizePlate(v.unitNumber) === plateKey)
    );
    const now = new Date().toISOString();
    const vehicle: SharedVehicle = {
      id: existing?.id ?? `vehicle-${input.companyId}-${plateKey.toLowerCase()}`,
      companyId: input.companyId,
      unitNumber: (input.unitNumber || existing?.unitNumber || plate).trim(),
      plate,
      make: input.make.trim(),
      model: input.model.trim(),
      year: Number(input.year),
      lastMileage: existing?.lastMileage,
      archivedAt: existing?.archivedAt,
      powertrain: inferPowertrain(
        input.make,
        input.model,
        input.powertrain ?? existing?.powertrain
      ),
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

export async function localSetVehiclePowertrain(
  id: string,
  powertrain: "gas" | "ev"
): Promise<SharedVehicle | undefined> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const idx = store.vehicles.findIndex((v) => v.id === id);
    if (idx < 0) return undefined;
    store.vehicles[idx] = {
      ...store.vehicles[idx],
      powertrain,
    };
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

export async function localSetReportArchived(
  id: string,
  archived: boolean
): Promise<CheckoutReport | undefined> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const idx = store.reports.findIndex((report) => report.id === id);
    if (idx < 0) return undefined;
    const next = { ...store.reports[idx] };
    if (archived) next.archivedAt = new Date().toISOString();
    else delete next.archivedAt;
    store.reports[idx] = next;
    await writeStore(store);
    return next;
  });
}

export async function localDeleteReport(id: string): Promise<boolean> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const idx = store.reports.findIndex((report) => report.id === id);
    if (idx < 0) return false;
    store.reports.splice(idx, 1);
    store.alerts = (store.alerts ?? []).filter((alert) => alert.reportId !== id);
    await writeStore(store);
    return true;
  });
}

export async function localListAlerts(includeArchived = false): Promise<SharedOfficeAlert[]> {
  const store = await localEnsureSeed();
  const alerts = [...(store.alerts ?? [])].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
  if (includeArchived) return alerts;
  return alerts.filter((alert) => !alert.archivedAt);
}

export async function localInsertAlert(alert: SharedOfficeAlert): Promise<void> {
  await enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    store.alerts = store.alerts ?? [];
    if (store.alerts.some((item) => item.id === alert.id)) return;
    store.alerts.unshift(alert);
    await writeStore(store);
  });
}

export async function localSetAlertArchived(
  id: string,
  archived: boolean
): Promise<SharedOfficeAlert | undefined> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const alerts = store.alerts ?? [];
    const idx = alerts.findIndex((alert) => alert.id === id);
    if (idx < 0) return undefined;
    const next = { ...alerts[idx] };
    if (archived) next.archivedAt = new Date().toISOString();
    else delete next.archivedAt;
    alerts[idx] = next;
    store.alerts = alerts;
    await writeStore(store);
    return next;
  });
}

export async function localDeleteAlert(id: string): Promise<boolean> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const alerts = store.alerts ?? [];
    const idx = alerts.findIndex((alert) => alert.id === id);
    if (idx < 0) return false;
    alerts.splice(idx, 1);
    store.alerts = alerts;
    await writeStore(store);
    return true;
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

export async function localGetFleetSettings(): Promise<FleetSettings> {
  const store = await localEnsureSeed();
  return {
    ...DEFAULT_FLEET_SETTINGS,
    ...(store.settings ?? {}),
  };
}

export async function localSetFleetSettings(
  patch: Partial<FleetSettings>
): Promise<FleetSettings> {
  return enqueueWrite(async () => {
    const store = await loadAndSeedUnlocked();
    const next: FleetSettings = {
      ...DEFAULT_FLEET_SETTINGS,
      ...(store.settings ?? {}),
      ...patch,
    };
    store.settings = next;
    await writeStore(store);
    return next;
  });
}
