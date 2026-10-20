import { neon } from "@neondatabase/serverless";
import { SEEDED_COMPANIES } from "@/lib/companies";
import {
  CheckoutInspectionForm,
  inferPowertrain,
} from "@/lib/inspection-form";
import {
  CheckoutReport,
  CheckoutReviewStatus,
  Company,
  PhotoAngle,
  VehiclePhoto,
} from "@/lib/types";
import { displayPlate, normalizePlate } from "@/lib/utils";
import { getDatabaseUrl } from "./shared-config";
import {
  sharedRecoveredReports,
  sharedSeedReports,
  sharedSeedVehicles,
} from "./seed-shared";
import {
  ListVehiclesOptions,
  SharedAppUser,
  SharedOfficeAlert,
  SharedVehicle,
  UpsertVehicleInput,
} from "./shared-types";
import type { FleetSettings } from "@/lib/fleet-settings";
import { DEFAULT_FLEET_SETTINGS } from "@/lib/fleet-settings";
import { SEEDED_APP_USERS } from "./seed-users";
import type { UserRole } from "@/lib/types";

function sqlClient() {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

type ReportRow = {
  id: string;
  company_id: string;
  vehicle_id: string;
  unit_number: string;
  plate: string | null;
  year: number;
  make: string;
  model: string;
  odometer: number;
  driver_name: string;
  dispatcher_name: string;
  type: CheckoutReport["type"];
  status: "complete";
  completed_at: string;
  review_status: CheckoutReviewStatus;
  review_notes: string | null;
  new_damage_notes: string | null;
  retake_angles: PhotoAngle[] | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  flagged: boolean;
  photos: VehiclePhoto[];
  created_at: string;
  signature_data_url: string | null;
  signed_at: string | null;
  inspection_form: CheckoutInspectionForm | null;
  archived_at?: string | null;
};

function rowToReport(row: ReportRow): CheckoutReport {
  return {
    id: row.id,
    companyId: row.company_id,
    vehicleId: row.vehicle_id,
    unitNumber: row.unit_number,
    plate: row.plate ?? undefined,
    year: Number(row.year),
    make: row.make,
    model: row.model,
    odometer: Number(row.odometer),
    driverName: row.driver_name,
    dispatcherName: row.dispatcher_name,
    type: row.type,
    photos: row.photos ?? [],
    status: "complete",
    completedAt: new Date(row.completed_at).toISOString(),
    reviewStatus: row.review_status,
    reviewNotes: row.review_notes ?? undefined,
    newDamageNotes: row.new_damage_notes ?? undefined,
    retakeAngles: row.retake_angles ?? undefined,
    reviewedAt: row.reviewed_at
      ? new Date(row.reviewed_at).toISOString()
      : undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    flagged: Boolean(row.flagged),
    synced: true,
    createdAt: new Date(row.created_at).toISOString(),
    signatureDataUrl: row.signature_data_url ?? undefined,
    signedAt: row.signed_at ? new Date(row.signed_at).toISOString() : undefined,
    inspectionForm: row.inspection_form ?? undefined,
    archivedAt: row.archived_at
      ? new Date(row.archived_at).toISOString()
      : undefined,
  };
}

let migrated = false;

export async function pgMigrateAndSeed(): Promise<void> {
  if (migrated) return;
  const sql = sqlClient();
  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      checklist_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      unit_number TEXT NOT NULL,
      plate TEXT NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INT NOT NULL,
      last_mileage INT,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS checkout_reports (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      unit_number TEXT NOT NULL,
      year INT NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      odometer INT NOT NULL,
      driver_name TEXT NOT NULL,
      dispatcher_name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL,
      review_status TEXT NOT NULL,
      review_notes TEXT,
      new_damage_notes TEXT,
      retake_angles JSONB,
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT,
      flagged BOOLEAN NOT NULL DEFAULT FALSE,
      photos JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS checkout_reports_vehicle_idx ON checkout_reports (vehicle_id)`;
  await sql`CREATE INDEX IF NOT EXISTS checkout_reports_company_idx ON checkout_reports (company_id)`;
  await sql`CREATE INDEX IF NOT EXISTS checkout_reports_review_idx ON checkout_reports (review_status)`;
  await sql`ALTER TABLE checkout_reports ADD COLUMN IF NOT EXISTS plate TEXT`;
  await sql`ALTER TABLE checkout_reports ADD COLUMN IF NOT EXISTS signature_data_url TEXT`;
  await sql`ALTER TABLE checkout_reports ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE checkout_reports ADD COLUMN IF NOT EXISTS inspection_form JSONB`;
  await sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  await sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS powertrain TEXT`;
  await sql`ALTER TABLE checkout_reports ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  await sql`
    CREATE TABLE IF NOT EXISTS fleet_alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      vehicle_plate TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      report_id TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      archived_at TIMESTAMPTZ
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fleet_settings (
      id TEXT PRIMARY KEY,
      allow_driver_add_vehicles BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;
  await sql`
    INSERT INTO fleet_settings (id, allow_driver_add_vehicles)
    VALUES ('app', FALSE)
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;
  for (const user of SEEDED_APP_USERS) {
    await sql`
      INSERT INTO app_users (id, name, email, role, active, created_at)
      VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.active}, ${user.createdAt})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const company of SEEDED_COMPANIES) {
    await sql`
      INSERT INTO companies (id, name, slug, checklist_id, created_at)
      VALUES (${company.id}, ${company.name}, ${company.slug}, ${company.checklistId}, ${company.createdAt})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  for (const vehicle of sharedSeedVehicles()) {
    await sql`
      INSERT INTO vehicles (id, company_id, unit_number, plate, make, model, year, last_mileage, created_at, powertrain)
      VALUES (
        ${vehicle.id}, ${vehicle.companyId}, ${vehicle.unitNumber}, ${vehicle.plate},
        ${vehicle.make}, ${vehicle.model}, ${vehicle.year}, ${vehicle.lastMileage ?? null},
        ${vehicle.createdAt}, ${vehicle.powertrain ?? "gas"}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  const reports = await sql`SELECT id FROM checkout_reports LIMIT 1`;
  if (reports.length === 0) {
    for (const report of sharedSeedReports()) {
      await upsertReportRow(report);
    }
  }

  for (const report of sharedRecoveredReports()) {
    const existing = await sql`
      SELECT id FROM checkout_reports WHERE id = ${report.id} LIMIT 1
    `;
    if (existing.length === 0) {
      await upsertReportRow(report);
    }
  }

  migrated = true;
}

export async function pgListCompanies(): Promise<Company[]> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = await sql`
    SELECT id, name, slug, checklist_id, created_at FROM companies ORDER BY name
  `;
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    checklistId: row.checklist_id as Company["checklistId"],
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

export async function pgListVehicles(
  companyId?: string,
  options?: ListVehiclesOptions
): Promise<SharedVehicle[]> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const includeArchived = Boolean(options?.includeArchived);
  const rows = companyId
    ? includeArchived
      ? await sql`
          SELECT * FROM vehicles WHERE company_id = ${companyId} ORDER BY unit_number
        `
      : await sql`
          SELECT * FROM vehicles
          WHERE company_id = ${companyId} AND archived_at IS NULL
          ORDER BY unit_number
        `
    : includeArchived
      ? await sql`SELECT * FROM vehicles ORDER BY unit_number`
      : await sql`
          SELECT * FROM vehicles WHERE archived_at IS NULL ORDER BY unit_number
        `;
  return rows.map((row) => mapVehicleRow(row));
}

function mapVehicleRow(row: Record<string, unknown>): SharedVehicle {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    unitNumber: String(row.unit_number),
    plate: String(row.plate),
    make: String(row.make),
    model: String(row.model),
    year: Number(row.year),
    lastMileage: row.last_mileage == null ? undefined : Number(row.last_mileage),
    archivedAt: row.archived_at
      ? new Date(String(row.archived_at)).toISOString()
      : undefined,
    powertrain: inferPowertrain(
      String(row.make),
      String(row.model),
      typeof row.powertrain === "string" ? row.powertrain : undefined
    ),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function pgGetVehicle(id: string): Promise<SharedVehicle | undefined> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = await sql`SELECT * FROM vehicles WHERE id = ${id} LIMIT 1`;
  const row = rows[0];
  if (!row) return undefined;
  return mapVehicleRow(row);
}

export async function pgFindVehicleByPlate(
  companyId: string,
  plate: string
): Promise<SharedVehicle | undefined> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const wanted = normalizePlate(plate);
  const rows = await sql`
    SELECT * FROM vehicles WHERE company_id = ${companyId}
  `;
  const row = rows.find(
    (item) =>
      normalizePlate(String(item.plate)) === wanted ||
      normalizePlate(String(item.unit_number)) === wanted
  );
  return row ? mapVehicleRow(row) : undefined;
}

export async function pgUpsertVehicle(
  input: UpsertVehicleInput
): Promise<SharedVehicle> {
  await pgMigrateAndSeed();
  const plateKey = normalizePlate(input.plate);
  const plate = displayPlate(input.plate);
  const existing = await pgFindVehicleByPlate(input.companyId, plateKey);
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
  const sql = sqlClient();
  await sql`
    INSERT INTO vehicles (id, company_id, unit_number, plate, make, model, year, last_mileage, created_at, powertrain)
    VALUES (
      ${vehicle.id}, ${vehicle.companyId}, ${vehicle.unitNumber}, ${vehicle.plate},
      ${vehicle.make}, ${vehicle.model}, ${vehicle.year}, ${vehicle.lastMileage ?? null},
      ${vehicle.createdAt}, ${vehicle.powertrain ?? "gas"}
    )
    ON CONFLICT (id) DO UPDATE SET
      unit_number = EXCLUDED.unit_number,
      plate = EXCLUDED.plate,
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      year = EXCLUDED.year,
      powertrain = EXCLUDED.powertrain
  `;
  return vehicle;
}

export async function pgSetVehicleArchived(
  id: string,
  archived: boolean
): Promise<SharedVehicle | undefined> {
  await pgMigrateAndSeed();
  const existing = await pgGetVehicle(id);
  if (!existing) return undefined;
  const sql = sqlClient();
  const archivedAt = archived ? new Date().toISOString() : null;
  await sql`UPDATE vehicles SET archived_at = ${archivedAt} WHERE id = ${id}`;
  return {
    ...existing,
    archivedAt: archivedAt ?? undefined,
  };
}

export async function pgSetVehiclePowertrain(
  id: string,
  powertrain: "gas" | "ev"
): Promise<SharedVehicle | undefined> {
  await pgMigrateAndSeed();
  const existing = await pgGetVehicle(id);
  if (!existing) return undefined;
  const sql = sqlClient();
  await sql`UPDATE vehicles SET powertrain = ${powertrain} WHERE id = ${id}`;
  return {
    ...existing,
    powertrain,
  };
}

export async function pgListReports(): Promise<CheckoutReport[]> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = (await sql`
    SELECT * FROM checkout_reports ORDER BY completed_at DESC
  `) as ReportRow[];
  return rows.map(rowToReport);
}

export async function pgGetReport(id: string): Promise<CheckoutReport | undefined> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = (await sql`
    SELECT * FROM checkout_reports WHERE id = ${id} LIMIT 1
  `) as ReportRow[];
  return rows[0] ? rowToReport(rows[0]) : undefined;
}

async function upsertReportRow(report: CheckoutReport): Promise<void> {
  const sql = sqlClient();
  await sql`
    INSERT INTO checkout_reports (
      id, company_id, vehicle_id, unit_number, plate, year, make, model, odometer,
      driver_name, dispatcher_name, type, status, completed_at, review_status,
      review_notes, new_damage_notes, retake_angles, reviewed_at, reviewed_by,
      flagged, photos, created_at, signature_data_url, signed_at, inspection_form
    ) VALUES (
      ${report.id}, ${report.companyId}, ${report.vehicleId}, ${report.unitNumber},
      ${report.plate ?? null},
      ${report.year}, ${report.make}, ${report.model}, ${report.odometer},
      ${report.driverName}, ${report.dispatcherName}, ${report.type}, ${report.status},
      ${report.completedAt}, ${report.reviewStatus}, ${report.reviewNotes ?? null},
      ${report.newDamageNotes ?? null},       CAST(${JSON.stringify(report.retakeAngles ?? [])} AS jsonb),
      ${report.reviewedAt ?? null}, ${report.reviewedBy ?? null}, ${report.flagged},
      CAST(${JSON.stringify(report.photos)} AS jsonb), ${report.createdAt},
      ${report.signatureDataUrl ?? null}, ${report.signedAt ?? null},
      CAST(${JSON.stringify(report.inspectionForm ?? null)} AS jsonb)
    )
    ON CONFLICT (id) DO UPDATE SET
      review_status = EXCLUDED.review_status,
      review_notes = EXCLUDED.review_notes,
      new_damage_notes = EXCLUDED.new_damage_notes,
      retake_angles = EXCLUDED.retake_angles,
      reviewed_at = EXCLUDED.reviewed_at,
      reviewed_by = EXCLUDED.reviewed_by,
      flagged = EXCLUDED.flagged,
      photos = EXCLUDED.photos,
      odometer = EXCLUDED.odometer,
      plate = EXCLUDED.plate,
      signature_data_url = EXCLUDED.signature_data_url,
      signed_at = EXCLUDED.signed_at,
      inspection_form = EXCLUDED.inspection_form
  `;
  await sql`
    UPDATE vehicles SET last_mileage = ${report.odometer} WHERE id = ${report.vehicleId}
  `;
}

export async function pgPutReport(report: CheckoutReport): Promise<CheckoutReport> {
  await pgMigrateAndSeed();
  await upsertReportRow(report);
  return { ...report, synced: true };
}

export async function pgGetFleetSettings(): Promise<FleetSettings> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = await sql`
    SELECT allow_driver_add_vehicles FROM fleet_settings WHERE id = 'app' LIMIT 1
  `;
  const row = rows[0];
  return {
    allowDriverAddVehicles: Boolean(row?.allow_driver_add_vehicles),
  };
}

export async function pgSetReportArchived(
  id: string,
  archived: boolean
): Promise<CheckoutReport | undefined> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const archivedAt = archived ? new Date().toISOString() : null;
  await sql`
    UPDATE checkout_reports
    SET archived_at = ${archivedAt}
    WHERE id = ${id}
  `;
  return pgGetReport(id);
}

export async function pgDeleteReport(id: string): Promise<boolean> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const existing = await pgGetReport(id);
  if (!existing) return false;
  await sql`DELETE FROM fleet_alerts WHERE report_id = ${id}`;
  await sql`DELETE FROM checkout_reports WHERE id = ${id}`;
  return true;
}

type AlertRow = {
  id: string;
  type: SharedOfficeAlert["type"];
  message: string;
  vehicle_id: string;
  vehicle_plate: string;
  actor_name: string;
  report_id: string | null;
  created_at: string;
  read: boolean;
  archived_at: string | null;
};

function rowToAlert(row: AlertRow): SharedOfficeAlert {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    vehicleId: row.vehicle_id,
    vehiclePlate: row.vehicle_plate,
    actorName: row.actor_name,
    reportId: row.report_id ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    read: Boolean(row.read),
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : undefined,
  };
}

export async function pgListAlerts(includeArchived = false): Promise<SharedOfficeAlert[]> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = (await sql`
    SELECT * FROM fleet_alerts ORDER BY created_at DESC
  `) as AlertRow[];
  const alerts = rows.map(rowToAlert);
  if (includeArchived) return alerts;
  return alerts.filter((alert) => !alert.archivedAt);
}

export async function pgInsertAlert(alert: SharedOfficeAlert): Promise<void> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  await sql`
    INSERT INTO fleet_alerts (
      id, type, message, vehicle_id, vehicle_plate, actor_name, report_id, created_at, read, archived_at
    ) VALUES (
      ${alert.id}, ${alert.type}, ${alert.message}, ${alert.vehicleId}, ${alert.vehiclePlate},
      ${alert.actorName}, ${alert.reportId ?? null}, ${alert.createdAt}, ${alert.read},
      ${alert.archivedAt ?? null}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function pgSetAlertArchived(
  id: string,
  archived: boolean
): Promise<SharedOfficeAlert | undefined> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const archivedAt = archived ? new Date().toISOString() : null;
  await sql`UPDATE fleet_alerts SET archived_at = ${archivedAt} WHERE id = ${id}`;
  const rows = (await sql`SELECT * FROM fleet_alerts WHERE id = ${id} LIMIT 1`) as AlertRow[];
  return rows[0] ? rowToAlert(rows[0]) : undefined;
}

export async function pgDeleteAlert(id: string): Promise<boolean> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = (await sql`SELECT id FROM fleet_alerts WHERE id = ${id} LIMIT 1`) as { id: string }[];
  if (!rows[0]) return false;
  await sql`DELETE FROM fleet_alerts WHERE id = ${id}`;
  return true;
}

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
};

function rowToUser(row: UserRow): SharedAppUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: Boolean(row.active),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function pgListUsers(): Promise<SharedAppUser[]> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = (await sql`SELECT * FROM app_users ORDER BY name`) as UserRow[];
  return rows.map(rowToUser);
}

export async function pgInsertUser(user: SharedAppUser): Promise<SharedAppUser> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  await sql`
    INSERT INTO app_users (id, name, email, role, active, created_at)
    VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.active}, ${user.createdAt})
  `;
  return user;
}

export async function pgUpdateUser(
  id: string,
  patch: Partial<Pick<SharedAppUser, "name" | "email" | "role" | "active">>
): Promise<SharedAppUser | undefined> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = (await sql`SELECT * FROM app_users WHERE id = ${id} LIMIT 1`) as UserRow[];
  if (!rows[0]) return undefined;
  const current = rowToUser(rows[0]);
  const next: SharedAppUser = {
    ...current,
    name: patch.name?.trim() || current.name,
    email: patch.email?.trim().toLowerCase() || current.email,
    role: patch.role || current.role,
    active: typeof patch.active === "boolean" ? patch.active : current.active,
  };
  await sql`
    UPDATE app_users
    SET name = ${next.name}, email = ${next.email}, role = ${next.role}, active = ${next.active}
    WHERE id = ${id}
  `;
  return next;
}

export async function pgSetFleetSettings(
  patch: Partial<FleetSettings>
): Promise<FleetSettings> {
  await pgMigrateAndSeed();
  const current = await pgGetFleetSettings();
  const next: FleetSettings = {
    ...DEFAULT_FLEET_SETTINGS,
    ...current,
    ...patch,
  };
  const sql = sqlClient();
  await sql`
    INSERT INTO fleet_settings (id, allow_driver_add_vehicles)
    VALUES ('app', ${next.allowDriverAddVehicles})
    ON CONFLICT (id) DO UPDATE SET
      allow_driver_add_vehicles = EXCLUDED.allow_driver_add_vehicles
  `;
  return next;
}
