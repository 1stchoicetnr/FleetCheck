import { neon } from "@neondatabase/serverless";
import { SEEDED_COMPANIES, TURO_COMPANY_ID, shouldMoveUnitToTuro } from "@/lib/companies";
import {
  CheckoutInspectionForm,
  inferPowertrain,
} from "@/lib/inspection-form";
import {
  CheckoutReport,
  CheckoutReviewStatus,
  Company,
  PhotoAngle,
  VehicleKnownIssue,
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
import * as orgData from "./org-data";
import { applyOrgStamp } from "./org-stamp";
import { orgFromSession } from "./org-scope";
import type { UserRole } from "@/lib/types";

function sqlClient() {
  const url = getDatabaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

function orgDb() {
  const sql = sqlClient();
  return {
    query: async (text: string, params?: unknown[]) =>
      (await sql.query(text, params ?? [])) as Array<Record<string, unknown>>,
  };
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
    photos: (row.photos ?? []).map((photo) => ({
    ...photo,
    dataUrl: photo.dataUrl || "",
  })),
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
  await sql`CREATE INDEX IF NOT EXISTS checkout_reports_completed_idx ON checkout_reports (completed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS checkout_reports_vehicle_completed_idx ON checkout_reports (vehicle_id, completed_at DESC)`;
  await sql`ALTER TABLE checkout_reports ADD COLUMN IF NOT EXISTS plate TEXT`;
  await sql`ALTER TABLE checkout_reports ADD COLUMN IF NOT EXISTS signature_data_url TEXT`;
  await sql`ALTER TABLE checkout_reports ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ`;
  await sql`ALTER TABLE checkout_reports ADD COLUMN IF NOT EXISTS inspection_form JSONB`;
  await sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`;
  await sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS powertrain TEXT`;
  await sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_oil_change_mileage INT`;
  await sql`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS known_issue JSONB`;
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
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;
  const db = orgDb();
  await applyOrgStamp(db);
  const orgId = orgFromSession();
  await orgData.seedFleetSettings(db, orgId);
  for (const user of SEEDED_APP_USERS) {
    await orgData.seedUser(db, orgId, user);
  }
  for (const company of SEEDED_COMPANIES) {
    await orgData.seedCompany(db, orgId, company);
  }
  const parkedWithOther = await orgData.vehiclesOutsideFleet(db, orgId, TURO_COMPANY_ID);
  for (const row of parkedWithOther) {
    const unit = {
      companyId: String(row.company_id),
      unitNumber: String(row.unit_number),
      plate: String(row.plate),
    };
    if (!shouldMoveUnitToTuro(unit)) continue;
    await orgData.moveVehicleToFleet(db, orgId, String(row.id), TURO_COMPANY_ID);
  }
  await orgData.alignReportsWithFleet(db, orgId, TURO_COMPANY_ID);
  for (const vehicle of sharedSeedVehicles()) {
    await orgData.seedVehicle(db, orgId, {
      id: vehicle.id,
      companyId: vehicle.companyId,
      unitNumber: vehicle.unitNumber,
      plate: vehicle.plate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      lastMileage: vehicle.lastMileage ?? null,
      createdAt: vehicle.createdAt,
      powertrain: vehicle.powertrain ?? "gas",
    });
  }

  if (!(await orgData.hasAnyReport(db, orgId))) {
    for (const report of sharedSeedReports()) {
      await upsertReportRow(orgId, report);
    }
  }

  for (const report of sharedRecoveredReports()) {
    if (!(await orgData.reportExists(db, orgId, report.id))) {
      await upsertReportRow(orgId, report);
    }
  }

  if (await orgData.restoreReplacedFrontPhoto(db, orgId)) {
    console.log(
      "[front-photo] restored original front on 1792511911545-kehi03k"
    );
  }

  migrated = true;
}

export async function pgAssertFleetInOrg(orgId: string, fleetId: string): Promise<void> {
  await pgMigrateAndSeed();
  await orgData.assertFleetInOrg(orgDb(), orgId, fleetId);
}

export async function pgListCompanies(orgId: string): Promise<Company[]> {
  await pgMigrateAndSeed();
  const rows = await orgData.listCompanies(orgDb(), orgId);
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    checklistId: row.checklist_id as Company["checklistId"],
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

export async function pgListVehicles(
  orgId: string,
  companyId?: string,
  options?: ListVehiclesOptions
): Promise<SharedVehicle[]> {
  await pgMigrateAndSeed();
  const rows = await orgData.listVehicles(
    orgDb(),
    orgId,
    companyId,
    Boolean(options?.includeArchived)
  );
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
    lastOilChangeMileage:
      row.last_oil_change_mileage == null
        ? undefined
        : Number(row.last_oil_change_mileage),
    knownIssue: mapKnownIssue(row.known_issue),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapKnownIssue(value: unknown): VehicleKnownIssue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const issue = value as Partial<VehicleKnownIssue>;
  const text = typeof issue.text === "string" ? issue.text.trim() : "";
  if (!text) return undefined;
  return {
    text: text.slice(0, 1000),
    isOpen: Boolean(issue.isOpen),
    updatedAt:
      typeof issue.updatedAt === "string" && issue.updatedAt
        ? issue.updatedAt
        : new Date(0).toISOString(),
    updatedBy: typeof issue.updatedBy === "string" ? issue.updatedBy : undefined,
    updatedByName:
      typeof issue.updatedByName === "string" ? issue.updatedByName : undefined,
  };
}

export async function pgGetVehicle(orgId: string, id: string): Promise<SharedVehicle | undefined> {
  await pgMigrateAndSeed();
  const row = await orgData.getVehicle(orgDb(), orgId, id);
  if (!row) return undefined;
  return mapVehicleRow(row);
}

export async function pgFindVehicleByPlate(
  orgId: string,
  companyId: string,
  plate: string
): Promise<SharedVehicle | undefined> {
  await pgMigrateAndSeed();
  const wanted = normalizePlate(plate);
  const rows = await orgData.vehiclesForFleet(orgDb(), orgId, companyId);
  const row = rows.find(
    (item) =>
      normalizePlate(String(item.plate)) === wanted ||
      normalizePlate(String(item.unit_number)) === wanted
  );
  return row ? mapVehicleRow(row) : undefined;
}

export async function pgUpsertVehicle(
  orgId: string,
  input: UpsertVehicleInput
): Promise<SharedVehicle> {
  await pgMigrateAndSeed();
  const plateKey = normalizePlate(input.plate);
  const plate = displayPlate(input.plate);
  const existing = await pgFindVehicleByPlate(orgId, input.companyId, plateKey);
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
    lastOilChangeMileage: existing?.lastOilChangeMileage,
    knownIssue: existing?.knownIssue,
    powertrain: inferPowertrain(
      input.make,
      input.model,
      input.powertrain ?? existing?.powertrain
    ),
    createdAt: existing?.createdAt ?? now,
  };
  await orgData.upsertVehicle(orgDb(), orgId, {
    id: vehicle.id,
    companyId: vehicle.companyId,
    unitNumber: vehicle.unitNumber,
    plate: vehicle.plate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    lastMileage: vehicle.lastMileage ?? null,
    createdAt: vehicle.createdAt,
    powertrain: vehicle.powertrain ?? "gas",
  });
  return vehicle;
}

export async function pgSetVehicleArchived(
  orgId: string,
  id: string,
  archived: boolean
): Promise<SharedVehicle | undefined> {
  await pgMigrateAndSeed();
  const existing = await pgGetVehicle(orgId, id);
  if (!existing) return undefined;
  const archivedAt = archived ? new Date().toISOString() : null;
  await orgData.setVehicleArchivedAt(orgDb(), orgId, id, archivedAt);
  return {
    ...existing,
    archivedAt: archivedAt ?? undefined,
  };
}

export async function pgSetVehiclePowertrain(
  orgId: string,
  id: string,
  powertrain: "gas" | "ev"
): Promise<SharedVehicle | undefined> {
  await pgMigrateAndSeed();
  const existing = await pgGetVehicle(orgId, id);
  if (!existing) return undefined;
  await orgData.setVehiclePowertrainRow(orgDb(), orgId, id, powertrain);
  return {
    ...existing,
    powertrain,
  };
}

export async function pgSetVehicleService(
  orgId: string,
  id: string,
  patch: {
    knownIssue?: VehicleKnownIssue | null;
    lastOilChangeMileage?: number | null;
  }
): Promise<SharedVehicle | undefined> {
  await pgMigrateAndSeed();
  const existing = await pgGetVehicle(orgId, id);
  if (!existing) return undefined;
  const touchIssue = patch.knownIssue !== undefined;
  const touchOil = patch.lastOilChangeMileage !== undefined;
  const issueJson =
    patch.knownIssue == null ? null : JSON.stringify(patch.knownIssue);
  await orgData.setVehicleServiceRow(orgDb(), orgId, id, {
    touchIssue,
    issueJson,
    touchOil,
    oilMileage: patch.lastOilChangeMileage ?? null,
  });
  return pgGetVehicle(orgId, id);
}

export async function pgListReportPage(
  orgId: string,
  query: {
    includeArchived?: boolean;
    companyId?: string | null;
    vehicleId?: string | null;
    status?: string | null;
    limit: number;
    offset: number;
  }
): Promise<{ reports: CheckoutReport[]; total: number; flagged: number }> {
  await pgMigrateAndSeed();
  const page = await orgData.listReportPage(orgDb(), orgId, {
    includeArchived: Boolean(query.includeArchived),
    companyId: query.companyId || null,
    vehicleId: query.vehicleId || null,
    status: query.status && query.status !== "all" ? query.status : null,
    limit: query.limit,
    offset: query.offset,
  });
  const rows = page.rows as ReportRow[];
  const count = page.counts;
  return {
    reports: rows.map(rowToReport),
    total: Number(count.total ?? 0),
    flagged: Number(count.flagged ?? 0),
  };
}

export async function pgListVehicleReports(
  orgId: string,
  vehicleId: string
): Promise<CheckoutReport[]> {
  await pgMigrateAndSeed();
  const rows = (await orgData.listVehicleReports(orgDb(), orgId, vehicleId)) as ReportRow[];
  return rows.map(rowToReport);
}

export async function pgListReports(orgId: string): Promise<CheckoutReport[]> {
  await pgMigrateAndSeed();
  const rows = (await orgData.listReports(orgDb(), orgId)) as ReportRow[];
  return rows.map(rowToReport);
}

export async function pgGetReport(orgId: string, id: string): Promise<CheckoutReport | undefined> {
  await pgMigrateAndSeed();
  const row = await orgData.getReport(orgDb(), orgId, id);
  return row ? rowToReport(row as ReportRow) : undefined;
}

async function upsertReportRow(orgId: string, report: CheckoutReport): Promise<void> {
  const db = orgDb();
  await orgData.upsertReport(db, orgId, {
    id: report.id,
    companyId: report.companyId,
    vehicleId: report.vehicleId,
    unitNumber: report.unitNumber,
    plate: report.plate ?? null,
    year: report.year,
    make: report.make,
    model: report.model,
    odometer: report.odometer,
    driverName: report.driverName,
    dispatcherName: report.dispatcherName,
    type: report.type,
    status: report.status,
    completedAt: report.completedAt,
    reviewStatus: report.reviewStatus,
    reviewNotes: report.reviewNotes ?? null,
    newDamageNotes: report.newDamageNotes ?? null,
    retakeAnglesJson: JSON.stringify(report.retakeAngles ?? []),
    reviewedAt: report.reviewedAt ?? null,
    reviewedBy: report.reviewedBy ?? null,
    flagged: report.flagged,
    photosJson: JSON.stringify(report.photos),
    createdAt: report.createdAt,
    signatureDataUrl: report.signatureDataUrl ?? null,
    signedAt: report.signedAt ?? null,
    inspectionFormJson: JSON.stringify(report.inspectionForm ?? null),
  });
  await orgData.setVehicleMileage(db, orgId, report.vehicleId, report.odometer);
}

export async function pgPutReport(orgId: string, report: CheckoutReport): Promise<CheckoutReport> {
  await pgMigrateAndSeed();
  await upsertReportRow(orgId, report);
  return { ...report, synced: true };
}

export async function pgGetFleetSettings(orgId: string): Promise<FleetSettings> {
  await pgMigrateAndSeed();
  const row = await orgData.getFleetSettings(orgDb(), orgId);
  return {
    allowDriverAddVehicles: Boolean(row?.allow_driver_add_vehicles),
  };
}

export async function pgSetReportArchived(
  orgId: string,
  id: string,
  archived: boolean
): Promise<CheckoutReport | undefined> {
  await pgMigrateAndSeed();
  const archivedAt = archived ? new Date().toISOString() : null;
  await orgData.setReportArchivedAt(orgDb(), orgId, id, archivedAt);
  return pgGetReport(orgId, id);
}

export async function pgDeleteReport(orgId: string, id: string): Promise<boolean> {
  await pgMigrateAndSeed();
  const existing = await pgGetReport(orgId, id);
  if (!existing) return false;
  return orgData.deleteReport(orgDb(), orgId, id);
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

export async function pgListAlerts(orgId: string, includeArchived = false): Promise<SharedOfficeAlert[]> {
  await pgMigrateAndSeed();
  const rows = (await orgData.listAlerts(orgDb(), orgId)) as AlertRow[];
  const alerts = rows.map(rowToAlert);
  if (includeArchived) return alerts;
  return alerts.filter((alert) => !alert.archivedAt);
}

export async function pgInsertAlert(orgId: string, alert: SharedOfficeAlert): Promise<void> {
  await pgMigrateAndSeed();
  await orgData.insertAlert(orgDb(), orgId, {
    id: alert.id,
    type: alert.type,
    message: alert.message,
    vehicleId: alert.vehicleId,
    vehiclePlate: alert.vehiclePlate,
    actorName: alert.actorName,
    reportId: alert.reportId ?? null,
    createdAt: alert.createdAt,
    read: alert.read,
    archivedAt: alert.archivedAt ?? null,
  });
}

export async function pgSetAlertArchived(
  orgId: string,
  id: string,
  archived: boolean
): Promise<SharedOfficeAlert | undefined> {
  await pgMigrateAndSeed();
  const archivedAt = archived ? new Date().toISOString() : null;
  const row = await orgData.setAlertArchivedAt(orgDb(), orgId, id, archivedAt);
  return row ? rowToAlert(row as AlertRow) : undefined;
}

export async function pgDeleteAlert(orgId: string, id: string): Promise<boolean> {
  await pgMigrateAndSeed();
  return orgData.deleteAlert(orgDb(), orgId, id);
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

export async function pgListUsers(orgId: string): Promise<SharedAppUser[]> {
  await pgMigrateAndSeed();
  const rows = (await orgData.listUsers(orgDb(), orgId)) as UserRow[];
  return rows.map(rowToUser);
}

export async function pgInsertUser(orgId: string, user: SharedAppUser): Promise<SharedAppUser> {
  await pgMigrateAndSeed();
  await orgData.insertUser(orgDb(), orgId, user);
  return user;
}

export async function pgUpdateUser(
  orgId: string,
  id: string,
  patch: Partial<Pick<SharedAppUser, "name" | "email" | "role" | "active">>
): Promise<SharedAppUser | undefined> {
  await pgMigrateAndSeed();
  const row = await orgData.getUser(orgDb(), orgId, id);
  if (!row) return undefined;
  const current = rowToUser(row as UserRow);
  const next: SharedAppUser = {
    ...current,
    name: patch.name?.trim() || current.name,
    email: patch.email?.trim().toLowerCase() || current.email,
    role: patch.role || current.role,
    active: typeof patch.active === "boolean" ? patch.active : current.active,
  };
  await orgData.updateUser(orgDb(), orgId, id, next);
  return next;
}

export async function pgSetFleetSettings(
  orgId: string,
  patch: Partial<FleetSettings>
): Promise<FleetSettings> {
  await pgMigrateAndSeed();
  const current = await pgGetFleetSettings(orgId);
  const next: FleetSettings = {
    ...DEFAULT_FLEET_SETTINGS,
    ...current,
    ...patch,
  };
  await orgData.setFleetSettings(orgDb(), orgId, next.allowDriverAddVehicles);
  return next;
}
