import { randomUUID } from "node:crypto";
import {
  applyKnownDamagePatch,
  parseKnownDamageList,
  type KnownDamage,
  type KnownDamageInput,
  type KnownDamagePatch,
} from "@/lib/known-damage";
import * as orgData from "./org-data";
import { localGetKnownDamage, localListKnownDamage, localSetKnownDamage } from "./local-store";
import { pgDb, pgMigrateAndSeed } from "./postgres-store";
import { sharedBackendMode } from "./shared-config";
import { SharedBackendError } from "./checkout-repo";

function mode() {
  const m = sharedBackendMode();
  if (m === "unconfigured") throw new SharedBackendError("Shared backend is not configured.", 503);
  return m;
}

async function readList(orgId: string, vehicleId: string): Promise<KnownDamage[]> {
  if (mode() === "postgres") {
    await pgMigrateAndSeed();
    const raw = await orgData.getVehicleKnownDamage(pgDb(), orgId, vehicleId);
    if (raw === undefined) throw new SharedBackendError("Unit not found", 404);
    return parseKnownDamageList(raw, vehicleId);
  }
  const raw = await localGetKnownDamage(vehicleId);
  if (raw === undefined) throw new SharedBackendError("Unit not found", 404);
  return parseKnownDamageList(raw, vehicleId);
}

async function writeList(orgId: string, vehicleId: string, list: KnownDamage[]): Promise<void> {
  const stored = list.map((item) => {
    const { vehicleId: _v, ...rest } = item;
    void _v;
    return rest;
  });
  const ok =
    mode() === "postgres"
      ? await orgData.setVehicleKnownDamage(pgDb(), orgId, vehicleId, stored)
      : await localSetKnownDamage(vehicleId, stored);
  if (!ok) throw new SharedBackendError("Unit not found", 404);
}

/** All known damage on a unit, repaired included (newest first). */
export async function listKnownDamage(orgId: string, vehicleId: string): Promise<KnownDamage[]> {
  return (await readList(orgId, vehicleId)).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

export async function addKnownDamage(
  orgId: string,
  vehicleId: string,
  input: KnownDamageInput,
  by: string
): Promise<KnownDamage> {
  const list = await readList(orgId, vehicleId);
  const { repaired, ...rest } = input;
  const now = new Date().toISOString();
  const item: KnownDamage = {
    id: `kd_${randomUUID().slice(0, 12)}`,
    vehicleId,
    ...rest,
    createdAt: now,
    createdBy: by,
    ...(repaired ? { repairedAt: now, repairedBy: by } : {}),
  };
  await writeList(orgId, vehicleId, [...list, item]);
  return item;
}

export async function updateKnownDamage(
  orgId: string,
  vehicleId: string,
  id: string,
  patch: KnownDamagePatch,
  by: string
): Promise<KnownDamage> {
  const list = await readList(orgId, vehicleId);
  const idx = list.findIndex((item) => item.id === id);
  if (idx < 0) throw new SharedBackendError("Known damage not found", 404);
  const next = applyKnownDamagePatch(list[idx], patch, by, new Date().toISOString());
  const updated = [...list];
  updated[idx] = next;
  await writeList(orgId, vehicleId, updated);
  return next;
}

export type KnownDamageUnit = {
  vehicleId: string;
  unitNumber: string;
  plate: string;
  companyId: string;
  items: KnownDamage[];
};

/** Every unit with saved known damage (office summary). */
export async function listKnownDamageUnits(orgId: string): Promise<KnownDamageUnit[]> {
  if (mode() === "postgres") {
    await pgMigrateAndSeed();
    const rows = await orgData.listVehiclesWithKnownDamage(pgDb(), orgId);
    return rows.map((row) => ({
      vehicleId: String(row.id),
      unitNumber: String(row.unit_number ?? ""),
      plate: String(row.plate ?? ""),
      companyId: String(row.company_id ?? ""),
      items: parseKnownDamageList(row.known_damage, String(row.id)),
    }));
  }
  return (await localListKnownDamage()).map(({ vehicle, list }) => ({
    vehicleId: vehicle.id,
    unitNumber: vehicle.unitNumber,
    plate: vehicle.plate,
    companyId: vehicle.companyId,
    items: parseKnownDamageList(list, vehicle.id),
  }));
}
