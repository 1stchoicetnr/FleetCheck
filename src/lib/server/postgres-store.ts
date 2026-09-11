import { neon } from "@neondatabase/serverless";
import { SEEDED_COMPANIES } from "@/lib/companies";
import {
  CheckoutReport,
  CheckoutReviewStatus,
  Company,
  PhotoAngle,
  VehiclePhoto,
} from "@/lib/types";
import { normalizePlate } from "@/lib/utils";
import { getDatabaseUrl } from "./shared-config";
import {
  sharedRecoveredReports,
  sharedSeedReports,
  sharedSeedVehicles,
} from "./seed-shared";
import { SharedVehicle, UpsertVehicleInput } from "./shared-types";

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

  for (const company of SEEDED_COMPANIES) {
    await sql`
      INSERT INTO companies (id, name, slug, checklist_id, created_at)
      VALUES (${company.id}, ${company.name}, ${company.slug}, ${company.checklistId}, ${company.createdAt})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  for (const vehicle of sharedSeedVehicles()) {
    await sql`
      INSERT INTO vehicles (id, company_id, unit_number, plate, make, model, year, last_mileage, created_at)
      VALUES (
        ${vehicle.id}, ${vehicle.companyId}, ${vehicle.unitNumber}, ${vehicle.plate},
        ${vehicle.make}, ${vehicle.model}, ${vehicle.year}, ${vehicle.lastMileage ?? null},
        ${vehicle.createdAt}
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

export async function pgListVehicles(companyId?: string): Promise<SharedVehicle[]> {
  await pgMigrateAndSeed();
  const sql = sqlClient();
  const rows = companyId
    ? await sql`
        SELECT * FROM vehicles WHERE company_id = ${companyId} ORDER BY unit_number
      `
    : await sql`SELECT * FROM vehicles ORDER BY unit_number`;
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
  const plate = normalizePlate(input.plate);
  const existing = await pgFindVehicleByPlate(input.companyId, plate);
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
    createdAt: existing?.createdAt ?? now,
  };
  const sql = sqlClient();
  await sql`
    INSERT INTO vehicles (id, company_id, unit_number, plate, make, model, year, last_mileage, created_at)
    VALUES (
      ${vehicle.id}, ${vehicle.companyId}, ${vehicle.unitNumber}, ${vehicle.plate},
      ${vehicle.make}, ${vehicle.model}, ${vehicle.year}, ${vehicle.lastMileage ?? null},
      ${vehicle.createdAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      unit_number = EXCLUDED.unit_number,
      plate = EXCLUDED.plate,
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      year = EXCLUDED.year
  `;
  return vehicle;
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
      flagged, photos, created_at
    ) VALUES (
      ${report.id}, ${report.companyId}, ${report.vehicleId}, ${report.unitNumber},
      ${report.plate ?? null},
      ${report.year}, ${report.make}, ${report.model}, ${report.odometer},
      ${report.driverName}, ${report.dispatcherName}, ${report.type}, ${report.status},
      ${report.completedAt}, ${report.reviewStatus}, ${report.reviewNotes ?? null},
      ${report.newDamageNotes ?? null},       CAST(${JSON.stringify(report.retakeAngles ?? [])} AS jsonb),
      ${report.reviewedAt ?? null}, ${report.reviewedBy ?? null}, ${report.flagged},
      CAST(${JSON.stringify(report.photos)} AS jsonb), ${report.createdAt}
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
      plate = EXCLUDED.plate
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
