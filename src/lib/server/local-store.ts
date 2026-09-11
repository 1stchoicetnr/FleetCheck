import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { SEEDED_COMPANIES } from "@/lib/companies";
import { CheckoutReport } from "@/lib/types";
import { sharedSeedReports, sharedSeedVehicles } from "./seed-shared";
import { SharedStore, SharedVehicle } from "./shared-types";

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
  if (store.vehicles.length === 0) {
    store.vehicles = sharedSeedVehicles();
    changed = true;
  }
  if (store.reports.length === 0) {
    store.reports = sharedSeedReports();
    changed = true;
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

export async function localListVehicles(companyId?: string): Promise<SharedVehicle[]> {
  const store = await localEnsureSeed();
  return companyId
    ? store.vehicles.filter((v) => v.companyId === companyId)
    : store.vehicles;
}

export async function localGetVehicle(id: string): Promise<SharedVehicle | undefined> {
  const store = await localEnsureSeed();
  return store.vehicles.find((v) => v.id === id);
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
