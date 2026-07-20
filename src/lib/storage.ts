import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  AppSettings,
  CheckRecord,
  Fleet,
  NotificationSettings,
  User,
  Vehicle,
} from "./types";
import { generateId } from "./utils";

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
  pendingSync: { key: string; value: { type: string; data: unknown; createdAt: string } };
}

let dbPromise: Promise<IDBPDatabase<FleetCheckDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<FleetCheckDB>("fleetcheck-db", 1, {
      upgrade(db) {
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
      },
    });
  }
  return dbPromise;
}

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  slackEnabled: false,
  emailEnabled: false,
  alertOnPoorCondition: true,
  alertOnMaintenance: true,
  alertOnOutOfService: true,
};

export async function seedDatabase() {
  const db = await getDB();
  const existingUsers = await db.count("users");
  if (existingUsers > 0) return;

  const taxiFleetId = generateId();
  const towFleetId = generateId();
  const turoFleetId = generateId();
  const users: User[] = [
    {
      id: generateId(),
      name: "Ashley",
      email: "ashley@fleetcheck.local",
      role: "super_admin",
      fleetIds: [taxiFleetId, towFleetId, turoFleetId],
    },
    {
      id: generateId(),
      name: "James",
      email: "james@fleetcheck.local",
      role: "super_admin",
      fleetIds: [taxiFleetId, towFleetId, turoFleetId],
    },
    {
      id: generateId(),
      name: "Manager",
      email: "manager@fleetcheck.local",
      role: "management",
      fleetIds: [taxiFleetId, towFleetId, turoFleetId],
    },
    {
      id: generateId(),
      name: "Tech",
      email: "tech@fleetcheck.local",
      role: "tech",
      fleetIds: [taxiFleetId, towFleetId, turoFleetId],
    },
    {
      id: generateId(),
      name: "Driver",
      email: "driver@fleetcheck.local",
      role: "driver",
      fleetIds: [taxiFleetId, towFleetId, turoFleetId],
    },
  ];

  const fleets: Fleet[] = [
    {
      id: taxiFleetId,
      name: "City Taxi Fleet",
      type: "taxi",
      createdAt: new Date().toISOString(),
    },
    {
      id: towFleetId,
      name: "Tow Operations",
      type: "tow",
      createdAt: new Date().toISOString(),
    },
    {
      id: turoFleetId,
      name: "Turo Rentals",
      type: "turo",
      createdAt: new Date().toISOString(),
    },
  ];

  const vehicles: Vehicle[] = [
    {
      id: generateId(),
      fleetId: taxiFleetId,
      plate: "ABC-1234",
      make: "Toyota",
      model: "Camry",
      year: 2022,
      status: "ready",
      lastMileage: 45230,
      qrCode: "FC-ABC1234",
      createdAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      fleetId: towFleetId,
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
      plate: "TUR-9012",
      make: "Honda",
      model: "CR-V",
      year: 2023,
      status: "ready",
      lastMileage: 22100,
      qrCode: "FC-TUR9012",
      createdAt: new Date().toISOString(),
    },
  ];

  const tx = db.transaction(
    ["users", "fleets", "vehicles", "settings"],
    "readwrite"
  );
  for (const user of users) await tx.objectStore("users").put(user);
  for (const fleet of fleets) await tx.objectStore("fleets").put(fleet);
  for (const vehicle of vehicles) await tx.objectStore("vehicles").put(vehicle);
  await tx.objectStore("settings").put({
    id: "app",
    companyName: "FleetCheck",
    notificationSettings: DEFAULT_NOTIFICATIONS,
  });
  await tx.done;
}

// Users
export async function getUsers(): Promise<User[]> {
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
  return (
    settings ?? {
      id: "app",
      companyName: "FleetCheck",
      notificationSettings: DEFAULT_NOTIFICATIONS,
    }
  );
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
