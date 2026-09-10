import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  AppSettings,
  CheckInDraft,
  CheckRecord,
  CheckType,
  CheckoutDraft,
  CheckoutReport,
  CheckoutReviewStatus,
  CheckoutType,
  Company,
  Fleet,
  FleetAlert,
  FleetType,
  MaintenanceLogEntry,
  NotificationSettings,
  normalizeFleetType,
  PHOTO_ANGLES,
  User,
  Vehicle,
  VehiclePhoto,
} from "./types";
import { generateId } from "./utils";
import { SLACK_CHANNEL_DEFAULTS } from "./slack-config";
import { PHOTO_EXAMPLE_PATHS } from "./photo-examples";
import {
  companyIdForFleetType,
  DEFAULT_OFFICE_PIN,
  FIRST_CHOICE_COMPANY_ID,
  OTHER_FLEETS_COMPANY_ID,
  RAD_CAB_COMPANY_ID,
  SEEDED_COMPANIES,
} from "./companies";

interface FleetCheckDB extends DBSchema {
  users: { key: string; value: User; indexes: { "by-email": string } };
  fleets: { key: string; value: Fleet };
  vehicles: {
    key: string;
    value: Vehicle;
    indexes: { "by-fleet": string; "by-plate": string; "by-qr": string };
  };
  checks: {
    key: string;
    value: CheckRecord;
    indexes: { "by-vehicle": string; "by-fleet": string; "by-driver": string };
  };
  settings: { key: string; value: AppSettings };
  pendingSync: {
    key: string;
    value: { id: string; type: string; data: unknown; createdAt: string };
  };
  drafts: { key: string; value: CheckInDraft };
  alerts: { key: string; value: FleetAlert };
  maintenanceLogs: {
    key: string;
    value: MaintenanceLogEntry;
    indexes: { "by-vehicle": string };
  };
  companies: { key: string; value: Company; indexes: { "by-slug": string } };
  checkoutReports: {
    key: string;
    value: CheckoutReport;
    indexes: {
      "by-company": string;
      "by-vehicle": string;
      "by-review": CheckoutReviewStatus;
    };
  };
  checkoutDrafts: { key: string; value: CheckoutDraft };
}

let dbPromise: Promise<IDBPDatabase<FleetCheckDB>> | null = null;

const FLEET_CANONICAL_NAMES: Record<FleetType, string> = {
  taxi: "Taxi",
  tow: "Tow Trucks",
  service_vehicle: "Service Vehicles",
  turo: "Turo",
};

async function migrateFleetCategories(
  db: IDBPDatabase<FleetCheckDB>
): Promise<void> {
  const fleets = await db.getAll("fleets");
  if (fleets.length === 0) return;

  const needsMerge =
    fleets.some((f) => f.type === "camera_car" || f.type === "other") ||
    fleets.filter((f) => normalizeFleetType(f.type) === "service_vehicle")
      .length > 1;
  const needsRename = fleets.some((f) => {
    const type = normalizeFleetType(f.type);
    return f.type !== type || f.name !== FLEET_CANONICAL_NAMES[type];
  });
  if (!needsMerge && !needsRename) return;

  const serviceCandidates = fleets.filter(
    (f) => normalizeFleetType(f.type) === "service_vehicle"
  );
  let serviceFleet =
    serviceCandidates.find((f) => f.type === "service_vehicle") ??
    serviceCandidates[0];

  if (serviceFleet) {
    serviceFleet = {
      ...serviceFleet,
      type: "service_vehicle",
      name: FLEET_CANONICAL_NAMES.service_vehicle,
    };
    await db.put("fleets", serviceFleet);
  }

  for (const fleet of fleets) {
    const normalized = normalizeFleetType(fleet.type);
    if (normalized !== "service_vehicle") continue;
    if (!serviceFleet) {
      serviceFleet = {
        ...fleet,
        type: "service_vehicle",
        name: FLEET_CANONICAL_NAMES.service_vehicle,
      };
      await db.put("fleets", serviceFleet);
      continue;
    }
    if (fleet.id === serviceFleet.id) continue;

    const fleetVehicles = await db.getAllFromIndex(
      "vehicles",
      "by-fleet",
      fleet.id
    );
    for (const vehicle of fleetVehicles) {
      await db.put("vehicles", { ...vehicle, fleetId: serviceFleet.id });
    }

    const fleetChecks = await db.getAllFromIndex("checks", "by-fleet", fleet.id);
    for (const check of fleetChecks) {
      await db.put("checks", { ...check, fleetId: serviceFleet.id });
    }

    await db.delete("fleets", fleet.id);
  }

  const refreshed = await db.getAll("fleets");
  for (const fleet of refreshed) {
    const type = normalizeFleetType(fleet.type);
    const name = FLEET_CANONICAL_NAMES[type];
    if (fleet.type !== type || fleet.name !== name) {
      await db.put("fleets", { ...fleet, type, name });
    }
  }
}

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<FleetCheckDB>("fleetcheck-db", 6, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const users = db.createObjectStore("users", { keyPath: "id" });
          users.createIndex("by-email", "email", { unique: true });

          const vehicles = db.createObjectStore("vehicles", { keyPath: "id" });
          vehicles.createIndex("by-fleet", "fleetId");
          vehicles.createIndex("by-plate", "plate");
          vehicles.createIndex("by-qr", "qrCode");

          db.createObjectStore("fleets", { keyPath: "id" });

          const checks = db.createObjectStore("checks", { keyPath: "id" });
          checks.createIndex("by-vehicle", "vehicleId");
          checks.createIndex("by-fleet", "fleetId");
          checks.createIndex("by-driver", "driverId");

          db.createObjectStore("settings", { keyPath: "id" });
          db.createObjectStore("pendingSync", { keyPath: "id" });
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains("drafts")) {
          db.createObjectStore("drafts", { keyPath: "id" });
        }
        if (oldVersion < 3 && !db.objectStoreNames.contains("alerts")) {
          db.createObjectStore("alerts", { keyPath: "id" });
        }
        if (oldVersion < 4 && !db.objectStoreNames.contains("maintenanceLogs")) {
          const logs = db.createObjectStore("maintenanceLogs", { keyPath: "id" });
          logs.createIndex("by-vehicle", "vehicleId");
        }
        if (oldVersion < 6) {
          if (!db.objectStoreNames.contains("companies")) {
            const companies = db.createObjectStore("companies", {
              keyPath: "id",
            });
            companies.createIndex("by-slug", "slug", { unique: true });
          }
          if (!db.objectStoreNames.contains("checkoutReports")) {
            const reports = db.createObjectStore("checkoutReports", {
              keyPath: "id",
            });
            reports.createIndex("by-company", "companyId");
            reports.createIndex("by-vehicle", "vehicleId");
            reports.createIndex("by-review", "reviewStatus");
          }
          if (!db.objectStoreNames.contains("checkoutDrafts")) {
            db.createObjectStore("checkoutDrafts", { keyPath: "id" });
          }
        }
      },
    }).then(async (db) => {
      await migrateFleetCategories(db);
      await migrateCompaniesAndCheckout(db);
      return db;
    });
  }
  return dbPromise;
}

const RAD_CAB_UNIT_12_ID = "vehicle-radcab-12";
const RAD_CAB_UNIT_18_ID = "vehicle-radcab-18";

function examplePhotos(capturedAt: string): VehiclePhoto[] {
  return PHOTO_ANGLES.map((step) => ({
    angle: step.angle,
    dataUrl: PHOTO_EXAMPLE_PATHS[step.angle],
    capturedAt,
  }));
}

function allCompanyIds(): string[] {
  return SEEDED_COMPANIES.map((c) => c.id);
}

function unitFromPlate(plate: string): string {
  const digits = plate.replace(/\D/g, "");
  return digits.slice(-2) || plate.replace(/[\s-]/g, "").slice(-4);
}

async function migrateCompaniesAndCheckout(
  db: IDBPDatabase<FleetCheckDB>
): Promise<void> {
  if (!db.objectStoreNames.contains("companies")) return;

  for (const company of SEEDED_COMPANIES) {
    const existing = await db.get("companies", company.id);
    if (!existing) {
      await db.put("companies", company);
    }
  }

  const fleets = await db.getAll("fleets");
  for (const fleet of fleets) {
    if (!fleet.companyId) {
      await db.put("fleets", {
        ...fleet,
        companyId: companyIdForFleetType(normalizeFleetType(fleet.type)),
      });
    }
  }

  const vehicles = await db.getAll("vehicles");
  const fleetsById = Object.fromEntries(
    (await db.getAll("fleets")).map((f) => [f.id, f])
  );
  for (const vehicle of vehicles) {
    const fleet = fleetsById[vehicle.fleetId];
    const companyId =
      vehicle.companyId ||
      fleet?.companyId ||
      companyIdForFleetType("taxi");
    const unitNumber = vehicle.unitNumber || unitFromPlate(vehicle.plate);
    if (vehicle.companyId !== companyId || vehicle.unitNumber !== unitNumber) {
      await db.put("vehicles", { ...vehicle, companyId, unitNumber });
    }
  }

  const users = await db.getAll("users");
  const companyIds = allCompanyIds();
  for (const user of users) {
    if (!user.companyIds || user.companyIds.length === 0) {
      await db.put("users", { ...user, companyIds });
    }
  }

  const settings = await db.get("settings", "app");
  if (settings && !settings.officePin) {
    await db.put("settings", { ...settings, officePin: DEFAULT_OFFICE_PIN });
  }

  await ensureRadCabUnits(db);
  await ensureSeededCheckoutReports(db);
}

async function ensureRadCabUnits(db: IDBPDatabase<FleetCheckDB>): Promise<void> {
  const fleets = await db.getAll("fleets");
  let taxiFleet = fleets.find(
    (f) => normalizeFleetType(f.type) === "taxi"
  );
  if (!taxiFleet) {
    taxiFleet = {
      id: generateId(),
      name: "Taxi",
      type: "taxi",
      companyId: RAD_CAB_COMPANY_ID,
      createdAt: new Date().toISOString(),
    };
    await db.put("fleets", taxiFleet);
  } else if (taxiFleet.companyId !== RAD_CAB_COMPANY_ID) {
    taxiFleet = { ...taxiFleet, companyId: RAD_CAB_COMPANY_ID };
    await db.put("fleets", taxiFleet);
  }

  const now = new Date().toISOString();
  const units: Vehicle[] = [
    {
      id: RAD_CAB_UNIT_12_ID,
      fleetId: taxiFleet.id,
      companyId: RAD_CAB_COMPANY_ID,
      unitNumber: "12",
      plate: "RC-0012",
      make: "Dodge",
      model: "Grand Caravan",
      year: 2014,
      status: "ready",
      lastMileage: 128440,
      lastOilChangeMileage: 125000,
      qrCode: "FC-RC0012",
      createdAt: now,
    },
    {
      id: RAD_CAB_UNIT_18_ID,
      fleetId: taxiFleet.id,
      companyId: RAD_CAB_COMPANY_ID,
      unitNumber: "18",
      plate: "RC-0018",
      make: "Dodge",
      model: "Grand Caravan",
      year: 2018,
      status: "ready",
      lastMileage: 87210,
      lastOilChangeMileage: 84000,
      qrCode: "FC-RC0018",
      createdAt: now,
    },
  ];

  for (const unit of units) {
    const existing = await db.get("vehicles", unit.id);
    if (!existing) {
      await db.put("vehicles", unit);
    } else if (!existing.companyId || !existing.unitNumber) {
      await db.put("vehicles", {
        ...existing,
        companyId: unit.companyId,
        unitNumber: unit.unitNumber,
      });
    }
  }
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function ensureSeededCheckoutReports(
  db: IDBPDatabase<FleetCheckDB>
): Promise<void> {
  if (!db.objectStoreNames.contains("checkoutReports")) return;
  const existing = await db.count("checkoutReports");
  if (existing > 0) return;

  const older = daysAgo(14);
  const recent = daysAgo(7);
  const pendingAt = daysAgo(1);

  const priorA: CheckoutReport = {
    id: "cr-seed-unit12-prior-2",
    companyId: RAD_CAB_COMPANY_ID,
    vehicleId: RAD_CAB_UNIT_12_ID,
    unitNumber: "12",
    year: 2014,
    make: "Dodge",
    model: "Grand Caravan",
    odometer: 127890,
    driverName: "Maria Santos",
    dispatcherName: "Ashley",
    type: "check_out",
    photos: examplePhotos(older),
    status: "complete",
    completedAt: older,
    reviewStatus: "pass",
    reviewNotes: "No new damage vs prior.",
    reviewedAt: older,
    reviewedBy: "Ashley",
    flagged: false,
    synced: true,
    createdAt: older,
  };

  const priorB: CheckoutReport = {
    id: "cr-seed-unit12-prior-1",
    companyId: RAD_CAB_COMPANY_ID,
    vehicleId: RAD_CAB_UNIT_12_ID,
    unitNumber: "12",
    year: 2014,
    make: "Dodge",
    model: "Grand Caravan",
    odometer: 128210,
    driverName: "Luis Ortega",
    dispatcherName: "James",
    type: "check_in",
    photos: examplePhotos(recent),
    status: "complete",
    completedAt: recent,
    reviewStatus: "pass",
    reviewNotes: "Same scuff on LF bumper as last report.",
    reviewedAt: recent,
    reviewedBy: "Ashley",
    flagged: false,
    synced: true,
    createdAt: recent,
  };

  const pending: CheckoutReport = {
    id: "cr-seed-unit18-pending",
    companyId: RAD_CAB_COMPANY_ID,
    vehicleId: RAD_CAB_UNIT_18_ID,
    unitNumber: "18",
    year: 2018,
    make: "Dodge",
    model: "Grand Caravan",
    odometer: 87210,
    driverName: "Driver",
    dispatcherName: "Ashley",
    type: "check_out",
    photos: examplePhotos(pendingAt),
    status: "complete",
    completedAt: pendingAt,
    reviewStatus: "pending",
    flagged: false,
    synced: true,
    createdAt: pendingAt,
  };

  await db.put("checkoutReports", priorA);
  await db.put("checkoutReports", priorB);
  await db.put("checkoutReports", pending);
}

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  inAppAlertsEnabled: true,
  slackEnabled: false,
  slackRadCabEnabled: true,
  slackEquipmentEnabled: true,
  alertOnCheckInOut: false,
  emailEnabled: false,
  alertOnPoorCondition: true,
  alertOnMaintenance: true,
  alertOnOutOfService: true,
};

export function normalizeNotificationSettings(
  ns?: Partial<NotificationSettings>
): NotificationSettings {
  return {
    ...DEFAULT_NOTIFICATIONS,
    ...ns,
    inAppAlertsEnabled: ns?.inAppAlertsEnabled ?? true,
    slackRadCabEnabled: ns?.slackRadCabEnabled ?? true,
    slackEquipmentEnabled: ns?.slackEquipmentEnabled ?? true,
    alertOnCheckInOut: ns?.alertOnCheckInOut ?? false,
    slackRadCabWebhookUrl:
      ns?.slackRadCabWebhookUrl ?? ns?.slackWebhookUrl ?? undefined,
    slackEquipmentWebhookUrl:
      ns?.slackEquipmentWebhookUrl ?? ns?.slackWebhookUrl ?? undefined,
    slackRadCabChannelId:
      ns?.slackRadCabChannelId ?? SLACK_CHANNEL_DEFAULTS.rad_cab.id,
    slackEquipmentChannelId:
      ns?.slackEquipmentChannelId ?? SLACK_CHANNEL_DEFAULTS.equipment.id,
  };
}

export async function seedDatabase() {
  const db = await getDB();
  const existingUsers = await db.count("users");
  if (existingUsers > 0) return;

  const taxiFleetId = generateId();
  const towFleetId = generateId();
  const turoFleetId = generateId();
  const serviceFleetId = generateId();
  const allFleetIds = [taxiFleetId, towFleetId, turoFleetId, serviceFleetId];
  const companyIds = allCompanyIds();
  const users: User[] = [
    {
      id: generateId(),
      name: "Ashley",
      email: "ashley@fleetcheck.local",
      role: "super_admin",
      fleetIds: allFleetIds,
      companyIds,
    },
    {
      id: generateId(),
      name: "James",
      email: "james@fleetcheck.local",
      role: "super_admin",
      fleetIds: allFleetIds,
      companyIds,
    },
    {
      id: generateId(),
      name: "Manager",
      email: "manager@fleetcheck.local",
      role: "management",
      fleetIds: allFleetIds,
      companyIds,
    },
    {
      id: generateId(),
      name: "Tech",
      email: "tech@fleetcheck.local",
      role: "tech",
      fleetIds: allFleetIds,
      companyIds,
    },
    {
      id: generateId(),
      name: "Driver",
      email: "driver@fleetcheck.local",
      role: "driver",
      fleetIds: allFleetIds,
      companyIds,
    },
  ];

  const fleets: Fleet[] = [
    {
      id: taxiFleetId,
      name: "Taxi",
      type: "taxi",
      companyId: RAD_CAB_COMPANY_ID,
      createdAt: new Date().toISOString(),
    },
    {
      id: towFleetId,
      name: "Tow Trucks",
      type: "tow",
      companyId: FIRST_CHOICE_COMPANY_ID,
      createdAt: new Date().toISOString(),
    },
    {
      id: serviceFleetId,
      name: "Service Vehicles",
      type: "service_vehicle",
      companyId: OTHER_FLEETS_COMPANY_ID,
      createdAt: new Date().toISOString(),
    },
    {
      id: turoFleetId,
      name: "Turo",
      type: "turo",
      companyId: OTHER_FLEETS_COMPANY_ID,
      createdAt: new Date().toISOString(),
    },
  ];

  const vehicles: Vehicle[] = [
    {
      id: generateId(),
      fleetId: taxiFleetId,
      companyId: RAD_CAB_COMPANY_ID,
      unitNumber: "23",
      plate: "ABC-1234",
      make: "Toyota",
      model: "Camry",
      year: 2022,
      status: "ready",
      lastMileage: 45230,
      lastOilChangeMileage: 40500,
      qrCode: "FC-ABC1234",
      createdAt: new Date().toISOString(),
      knownIssue: {
        text: "Left rear window not working – part on order",
        isOpen: true,
        updatedAt: new Date().toISOString(),
        updatedByName: "Tech",
      },
    },
    {
      id: generateId(),
      fleetId: towFleetId,
      companyId: FIRST_CHOICE_COMPANY_ID,
      unitNumber: "T1",
      plate: "TOW-5678",
      make: "Ford",
      model: "F-550",
      year: 2021,
      status: "needs_work",
      lastMileage: 78450,
      qrCode: "FC-TOW5678",
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      fleetId: turoFleetId,
      companyId: OTHER_FLEETS_COMPANY_ID,
      unitNumber: "9012",
      plate: "TUR-9012",
      make: "Honda",
      model: "CR-V",
      year: 2023,
      status: "ready",
      lastMileage: 22100,
      qrCode: "FC-TUR9012",
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      fleetId: serviceFleetId,
      companyId: OTHER_FLEETS_COMPANY_ID,
      unitNumber: "3456",
      plate: "SVC-3456",
      make: "Chevrolet",
      model: "Express",
      year: 2020,
      status: "ready",
      lastMileage: 91200,
      qrCode: "FC-SVC3456",
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      fleetId: serviceFleetId,
      companyId: OTHER_FLEETS_COMPANY_ID,
      unitNumber: "7890",
      plate: "CAM-7890",
      make: "Nissan",
      model: "Altima",
      year: 2022,
      status: "ready",
      lastMileage: 33400,
      qrCode: "FC-CAM7890",
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      fleetId: serviceFleetId,
      companyId: OTHER_FLEETS_COMPANY_ID,
      unitNumber: "2468",
      plate: "GEN-2468",
      make: "Hyundai",
      model: "Elantra",
      year: 2021,
      status: "ready",
      lastMileage: 56780,
      qrCode: "FC-GEN2468",
      createdAt: new Date().toISOString(),
    },
  ];

  const tx = db.transaction(
    ["users", "fleets", "vehicles", "settings", "companies"],
    "readwrite"
  );
  for (const company of SEEDED_COMPANIES) {
    await tx.objectStore("companies").put(company);
  }
  for (const user of users) await tx.objectStore("users").put(user);
  for (const fleet of fleets) await tx.objectStore("fleets").put(fleet);
  for (const vehicle of vehicles) await tx.objectStore("vehicles").put(vehicle);
  await tx.objectStore("settings").put({
    id: "app",
    companyName: "FleetCheck",
    officePin: DEFAULT_OFFICE_PIN,
    notificationSettings: DEFAULT_NOTIFICATIONS,
  });
  await tx.done;

  await ensureRadCabUnits(db);
  await ensureSeededCheckoutReports(db);
}

// Users
export async function getUsers(): Promise<User[]> {
  await seedDatabase();
  return (await getDB()).getAll("users");
}

export async function getUserById(id: string): Promise<User | undefined> {
  return (await getDB()).get("users", id);
}

export async function saveUser(user: User): Promise<void> {
  await (await getDB()).put("users", user);
}

// Fleets
export async function getFleets(): Promise<Fleet[]> {
  return (await getDB()).getAll("fleets");
}

export async function getFleetById(id: string): Promise<Fleet | undefined> {
  return (await getDB()).get("fleets", id);
}

export async function saveFleet(fleet: Fleet): Promise<void> {
  await (await getDB()).put("fleets", fleet);
}

// Vehicles
export async function getVehicles(): Promise<Vehicle[]> {
  return (await getDB()).getAll("vehicles");
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  return (await getDB()).get("vehicles", id);
}

export async function getVehicleByPlate(
  plate: string
): Promise<Vehicle | undefined> {
  const db = await getDB();
  const normalized = plate.replace(/[\s-]/g, "").toUpperCase();
  const all = await db.getAll("vehicles");
  return all.find(
    (v) => v.plate.replace(/[\s-]/g, "").toUpperCase() === normalized
  );
}

export async function getVehicleByQR(
  qr: string
): Promise<Vehicle | undefined> {
  const db = await getDB();
  const all = await db.getAll("vehicles");
  return all.find(
    (v) => v.qrCode.toUpperCase() === qr.trim().toUpperCase()
  );
}

export async function saveVehicle(vehicle: Vehicle): Promise<void> {
  await (await getDB()).put("vehicles", vehicle);
}

export async function updateVehicleStatus(
  id: string,
  status: Vehicle["status"]
): Promise<void> {
  const vehicle = await getVehicleById(id);
  if (vehicle) {
    vehicle.status = status;
    await saveVehicle(vehicle);
  }
}

// Checks
export async function getChecks(): Promise<CheckRecord[]> {
  return (await getDB()).getAll("checks");
}

export async function getChecksByVehicle(
  vehicleId: string
): Promise<CheckRecord[]> {
  return (await getDB()).getAllFromIndex("checks", "by-vehicle", vehicleId);
}

export async function saveCheck(check: CheckRecord): Promise<void> {
  await (await getDB()).put("checks", check);
  if (!check.synced) {
    await (await getDB()).put("pendingSync", {
      id: generateId(),
      type: "check",
      data: check,
      createdAt: new Date().toISOString(),
    });
  }
}

// Settings
export async function getSettings(): Promise<AppSettings> {
  const settings = await (await getDB()).get("settings", "app");
  return {
    ...(settings ?? {
      id: "app",
      companyName: "FleetCheck",
    }),
    id: "app",
    companyName: settings?.companyName ?? "FleetCheck",
    officePin: settings?.officePin ?? DEFAULT_OFFICE_PIN,
    notificationSettings: normalizeNotificationSettings(
      settings?.notificationSettings
    ),
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await (await getDB()).put("settings", { ...settings, id: "app" });
}

// Pending sync
export async function getPendingSyncCount(): Promise<number> {
  return (await getDB()).count("pendingSync");
}

export async function clearPendingSync(): Promise<void> {
  const db = await getDB();
  const all = await db.getAll("pendingSync");
  const tx = db.transaction("pendingSync", "readwrite");
  for (const item of all) await tx.store.delete(item.id);
  await tx.done;
}

/** Mark offline checks as synced when back online (local demo sync). */
export async function syncPendingRecords(): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;

  const db = await getDB();
  const pending = await db.getAll("pendingSync");
  if (pending.length === 0) return 0;

  const checkTx = db.transaction("checks", "readwrite");
  for (const item of pending) {
    if (item.type === "check") {
      const check = item.data as CheckRecord;
      await checkTx.store.put({ ...check, synced: true });
    }
  }
  await checkTx.done;
  await clearPendingSync();
  return pending.length;
}

export function draftId(vehicleId: string, checkType: CheckType, driverId: string) {
  return `${vehicleId}-${checkType}-${driverId}`;
}

export async function saveCheckInDraft(draft: CheckInDraft): Promise<void> {
  await (await getDB()).put("drafts", {
    ...draft,
    updatedAt: new Date().toISOString(),
  });
}

export async function getCheckInDraft(id: string): Promise<CheckInDraft | undefined> {
  return (await getDB()).get("drafts", id);
}

export async function deleteCheckInDraft(id: string): Promise<void> {
  await (await getDB()).delete("drafts", id);
}

// Alerts
export async function getAlerts(): Promise<FleetAlert[]> {
  const alerts = await (await getDB()).getAll("alerts");
  return alerts.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function saveAlert(alert: FleetAlert): Promise<void> {
  await (await getDB()).put("alerts", alert);
}

export async function markAlertRead(id: string): Promise<void> {
  const alert = await (await getDB()).get("alerts", id);
  if (alert) {
    await (await getDB()).put("alerts", { ...alert, read: true });
  }
}

export async function markAllAlertsRead(): Promise<void> {
  const db = await getDB();
  const alerts = await db.getAll("alerts");
  const tx = db.transaction("alerts", "readwrite");
  for (const alert of alerts) {
    if (!alert.read) {
      await tx.store.put({ ...alert, read: true });
    }
  }
  await tx.done;
}

export async function getUnreadAlertCount(): Promise<number> {
  const alerts = await (await getDB()).getAll("alerts");
  return alerts.filter((a) => !a.read).length;
}

export async function getMaintenanceLogsByVehicle(
  vehicleId: string
): Promise<MaintenanceLogEntry[]> {
  const logs = await (await getDB()).getAllFromIndex(
    "maintenanceLogs",
    "by-vehicle",
    vehicleId
  );
  return logs.sort(
    (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()
  );
}

export async function saveMaintenanceLog(
  entry: MaintenanceLogEntry
): Promise<void> {
  await (await getDB()).put("maintenanceLogs", entry);
}

export async function getChecksByVehicleSorted(
  vehicleId: string
): Promise<CheckRecord[]> {
  const checks = await getChecksByVehicle(vehicleId);
  return checks.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// Companies
export async function getCompanies(): Promise<Company[]> {
  await seedDatabase();
  const companies = await (await getDB()).getAll("companies");
  return companies.sort((a, b) => {
    if (a.id === RAD_CAB_COMPANY_ID) return -1;
    if (b.id === RAD_CAB_COMPANY_ID) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function getCompanyById(id: string): Promise<Company | undefined> {
  return (await getDB()).get("companies", id);
}

export async function saveCompany(company: Company): Promise<void> {
  await (await getDB()).put("companies", company);
}

export async function getVehiclesByCompany(companyId: string): Promise<Vehicle[]> {
  const all = await getVehicles();
  return all.filter((v) => v.companyId === companyId);
}

export async function getVehicleByUnit(
  companyId: string,
  unitNumber: string
): Promise<Vehicle | undefined> {
  const normalized = unitNumber.replace(/\s+/g, "").toUpperCase();
  const all = await getVehiclesByCompany(companyId);
  return all.find(
    (v) =>
      v.unitNumber.replace(/\s+/g, "").toUpperCase() === normalized ||
      v.plate.replace(/[\s-]/g, "").toUpperCase() === normalized
  );
}

// Checkout reports
export async function getCheckoutReports(): Promise<CheckoutReport[]> {
  const reports = await (await getDB()).getAll("checkoutReports");
  return reports.sort(
    (a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
}

export async function getCheckoutReportById(
  id: string
): Promise<CheckoutReport | undefined> {
  return (await getDB()).get("checkoutReports", id);
}

export async function getCheckoutReportsByVehicle(
  vehicleId: string
): Promise<CheckoutReport[]> {
  const reports = await (await getDB()).getAllFromIndex(
    "checkoutReports",
    "by-vehicle",
    vehicleId
  );
  return reports.sort(
    (a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
}

export async function getCheckoutReportsByCompany(
  companyId: string
): Promise<CheckoutReport[]> {
  const reports = await (await getDB()).getAllFromIndex(
    "checkoutReports",
    "by-company",
    companyId
  );
  return reports.sort(
    (a, b) =>
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
}

export function isCheckoutFlagged(report: CheckoutReport): boolean {
  return (
    report.flagged ||
    report.reviewStatus === "conditional" ||
    report.reviewStatus === "fail" ||
    !!(report.newDamageNotes && report.newDamageNotes.trim())
  );
}

export async function saveCheckoutReport(
  report: CheckoutReport
): Promise<void> {
  await (await getDB()).put("checkoutReports", report);
}

export async function getPriorCheckoutReports(
  vehicleId: string,
  currentId?: string,
  limit = 2
): Promise<CheckoutReport[]> {
  const reports = await getCheckoutReportsByVehicle(vehicleId);
  return reports.filter((r) => r.id !== currentId).slice(0, limit);
}

export function checkoutDraftId(
  companyId: string,
  vehicleId: string,
  type: CheckoutType,
  driverId: string
): string {
  return `cr-${companyId}-${vehicleId}-${type}-${driverId}`;
}

export async function saveCheckoutDraft(draft: CheckoutDraft): Promise<void> {
  await (await getDB()).put("checkoutDrafts", {
    ...draft,
    updatedAt: new Date().toISOString(),
  });
}

export async function getCheckoutDraft(
  id: string
): Promise<CheckoutDraft | undefined> {
  return (await getDB()).get("checkoutDrafts", id);
}

export async function deleteCheckoutDraft(id: string): Promise<void> {
  await (await getDB()).delete("checkoutDrafts", id);
}
