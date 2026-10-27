import {
  rolloutSlateCutoffIso,
  rolloutUserDecision,
  type RolloutUserDecision,
} from "../rollout-slate";
import { FIRST_CHOICE_ORG_ID } from "./org-stamp";
import { OrgAccessError, requireOrgId } from "./org-scope";

/**
 * The only application module that may read or write
 * companies, vehicles, fleets, user_fleets, checkout_reports, fleet_alerts,
 * app_users, app_feedback, fleet_settings, and slack_deliveries.
 * Every statement includes org_id. org-stamp.ts is the migration only.
 */
export type OrgDb = {
  query(
    text: string,
    params?: unknown[]
  ): Promise<Array<Record<string, unknown>>>;
};

function org(orgId: string): string {
  return requireOrgId(orgId);
}

function storedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function assertFleetInOrg(
  db: OrgDb,
  orgId: string,
  fleetId: string
): Promise<void> {
  const id = org(orgId);
  if (!fleetId.trim()) throw new OrgAccessError();
  const rows = await db.query(
    "SELECT id FROM companies WHERE id = $1 AND org_id = $2",
    [fleetId, id]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function listCompanies(db: OrgDb, orgId: string) {
  return db.query(
    "SELECT id, name, slug, checklist_id, created_at FROM companies WHERE org_id = $1 ORDER BY name",
    [org(orgId)]
  );
}

export async function listFleets(db: OrgDb, orgId: string, includeArchived: boolean) {
  return db.query(
    `SELECT id, company_id, name, type, archived_at, created_at
     FROM fleets
     WHERE org_id = $1
       AND ($2::boolean OR archived_at IS NULL)
     ORDER BY name`,
    [org(orgId), includeArchived]
  );
}

export async function getFleet(db: OrgDb, orgId: string, id: string) {
  const rows = await db.query(
    `SELECT id, company_id, name, type, archived_at, created_at
     FROM fleets WHERE id = $1 AND org_id = $2`,
    [id, org(orgId)]
  );
  return rows[0];
}

/** A fleet row, not a company id. companyId must be the fleet's company. */
export async function assertFleetRecord(
  db: OrgDb,
  orgId: string,
  fleetId: string,
  companyId: string
): Promise<void> {
  const id = org(orgId);
  if (!fleetId.trim() || !companyId.trim()) throw new OrgAccessError();
  const rows = await db.query(
    "SELECT id FROM fleets WHERE id = $1 AND org_id = $2 AND company_id = $3",
    [fleetId, id, companyId]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function seedFleet(
  db: OrgDb,
  orgId: string,
  fleet: {
    id: string;
    companyId: string;
    name: string;
    type: string;
    createdAt: string;
  }
) {
  await db.query(
    `INSERT INTO fleets (id, org_id, company_id, name, type, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO NOTHING`,
    [fleet.id, org(orgId), fleet.companyId, fleet.name, fleet.type, fleet.createdAt]
  );
}

/** Fill only vehicles that do not already have a fleet, so a later edit survives. */
export async function assignVehiclesToFleet(
  db: OrgDb,
  orgId: string,
  fleetId: string,
  companyId: string
) {
  await db.query(
    `UPDATE vehicles SET fleet_id = $1
     WHERE org_id = $2 AND company_id = $3 AND fleet_id IS NULL`,
    [fleetId, org(orgId), companyId]
  );
}

export async function insertFleet(
  db: OrgDb,
  orgId: string,
  fleet: {
    id: string;
    companyId: string;
    name: string;
    type: string;
    createdAt: string;
  }
) {
  await assertFleetInOrg(db, orgId, fleet.companyId);
  const rows = await db.query(
    `INSERT INTO fleets (id, org_id, company_id, name, type, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, company_id, name, type, archived_at, created_at`,
    [fleet.id, org(orgId), fleet.companyId, fleet.name, fleet.type, fleet.createdAt]
  );
  if (!rows[0]) throw new OrgAccessError();
  return rows[0];
}

export async function renameFleet(db: OrgDb, orgId: string, id: string, name: string) {
  const rows = await db.query(
    "UPDATE fleets SET name = $1 WHERE id = $2 AND org_id = $3 RETURNING id",
    [name, id, org(orgId)]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function setFleetArchivedAt(
  db: OrgDb,
  orgId: string,
  id: string,
  archivedAt: string | null
) {
  const rows = await db.query(
    "UPDATE fleets SET archived_at = $1 WHERE id = $2 AND org_id = $3 RETURNING id",
    [archivedAt, id, org(orgId)]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function deleteFleet(db: OrgDb, orgId: string, id: string): Promise<boolean> {
  const rows = await db.query(
    "DELETE FROM fleets WHERE id = $1 AND org_id = $2 RETURNING id",
    [id, org(orgId)]
  );
  return Boolean(rows[0]);
}

export async function listVehicles(
  db: OrgDb,
  orgId: string,
  companyId: string | undefined,
  includeArchived: boolean
) {
  const id = org(orgId);
  if (companyId) await assertFleetInOrg(db, id, companyId);
  if (companyId) {
    return includeArchived
      ? db.query(
          "SELECT * FROM vehicles WHERE org_id = $1 AND company_id = $2 ORDER BY unit_number",
          [id, companyId]
        )
      : db.query(
          "SELECT * FROM vehicles WHERE org_id = $1 AND company_id = $2 AND archived_at IS NULL ORDER BY unit_number",
          [id, companyId]
        );
  }
  return includeArchived
    ? db.query(
        "SELECT * FROM vehicles WHERE org_id = $1 ORDER BY unit_number",
        [id]
      )
    : db.query(
        "SELECT * FROM vehicles WHERE org_id = $1 AND archived_at IS NULL ORDER BY unit_number",
        [id]
      );
}

export async function getVehicle(db: OrgDb, orgId: string, id: string) {
  const rows = await db.query(
    "SELECT * FROM vehicles WHERE id = $1 AND org_id = $2 LIMIT 1",
    [id, org(orgId)]
  );
  return rows[0];
}

export async function vehiclesForFleet(db: OrgDb, orgId: string, companyId: string) {
  await assertFleetInOrg(db, orgId, companyId);
  return db.query(
    "SELECT * FROM vehicles WHERE org_id = $1 AND company_id = $2",
    [org(orgId), companyId]
  );
}

export async function upsertVehicle(
  db: OrgDb,
  orgId: string,
  vehicle: {
    id: string;
    companyId: string;
    unitNumber: string;
    plate: string;
    make: string;
    model: string;
    year: number;
    lastMileage: number | null;
    createdAt: string;
    powertrain: string;
    fleetId?: string | null;
  }
) {
  await assertFleetInOrg(db, orgId, vehicle.companyId);
  const rows = await db.query(
    `INSERT INTO vehicles (
      id, company_id, unit_number, plate, make, model, year, last_mileage, created_at, powertrain, org_id, fleet_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO UPDATE SET
      unit_number = EXCLUDED.unit_number,
      plate = EXCLUDED.plate,
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      year = EXCLUDED.year,
      powertrain = EXCLUDED.powertrain,
      fleet_id = COALESCE(EXCLUDED.fleet_id, vehicles.fleet_id)
    WHERE vehicles.org_id = EXCLUDED.org_id
    RETURNING id`,
    [
      vehicle.id,
      vehicle.companyId,
      vehicle.unitNumber,
      vehicle.plate,
      vehicle.make,
      vehicle.model,
      vehicle.year,
      vehicle.lastMileage,
      vehicle.createdAt,
      vehicle.powertrain,
      org(orgId),
      vehicle.fleetId ?? null,
    ]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function setVehicleArchivedAt(
  db: OrgDb,
  orgId: string,
  id: string,
  archivedAt: string | null
) {
  const rows = await db.query(
    "UPDATE vehicles SET archived_at = $1 WHERE id = $2 AND org_id = $3 RETURNING id",
    [archivedAt, id, org(orgId)]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function setVehiclePowertrainRow(
  db: OrgDb,
  orgId: string,
  id: string,
  powertrain: string
) {
  const rows = await db.query(
    "UPDATE vehicles SET powertrain = $1 WHERE id = $2 AND org_id = $3 RETURNING id",
    [powertrain, id, org(orgId)]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function setVehicleServiceRow(
  db: OrgDb,
  orgId: string,
  id: string,
  patch: {
    touchIssue: boolean;
    issueJson: string | null;
    touchOil: boolean;
    oilMileage: number | null;
  }
) {
  const rows = await db.query(
    `UPDATE vehicles SET
      known_issue = CASE WHEN $1::boolean THEN CAST($2 AS jsonb) ELSE known_issue END,
      last_oil_change_mileage = CASE WHEN $3::boolean THEN $4::int ELSE last_oil_change_mileage END
    WHERE id = $5 AND org_id = $6
    RETURNING id`,
    [
      patch.touchIssue,
      patch.issueJson,
      patch.touchOil,
      patch.oilMileage,
      id,
      org(orgId),
    ]
  );
  if (!rows[0]) throw new OrgAccessError();
}

const REPORT_PAGE_FILTER = `
  org_id = $1
  AND ($3::text IS NULL OR company_id = $3::text)
  AND ($4::text IS NULL OR vehicle_id = $4::text)
  AND (
    ($5::text = 'archived' AND archived_at IS NOT NULL)
    OR (
      COALESCE($5::text, '') <> 'archived'
      AND ($2::boolean OR archived_at IS NULL)
    )
  )
`;

const STATUS_MATCH = `
  (
    $5::text IS NULL
    OR (
      $5::text = 'flagged'
      AND (
        flagged
        OR review_status IN ('conditional', 'fail')
        OR btrim(COALESCE(new_damage_notes, '')) <> ''
      )
    )
    OR (
      $5::text IS NOT NULL
      AND $5::text <> 'flagged'
      AND $5::text <> 'archived'
      AND review_status = $5::text
    )
    OR $5::text = 'archived'
  )
`;

export async function listReportPage(
  db: OrgDb,
  orgId: string,
  query: {
    includeArchived: boolean;
    companyId: string | null;
    vehicleId: string | null;
    status: string | null;
    limit: number;
    offset: number;
    /** When set, only these units. An empty list matches nothing. Omit for every unit. */
    vehicleIds?: string[] | null;
  }
) {
  if (query.companyId) await assertFleetInOrg(db, orgId, query.companyId);
  const scopedVehicles = query.vehicleIds ?? null;
  const vehicleParams = scopedVehicles ?? [];
  const vehicleSql =
    scopedVehicles === null
      ? ""
      : scopedVehicles.length === 0
        ? "AND FALSE"
        : `AND vehicle_id IN (${vehicleParams.map((_, index) => `$${6 + index}`).join(", ")})`;
  const params = [
    org(orgId),
    query.includeArchived,
    query.companyId,
    query.vehicleId,
    query.status,
    ...vehicleParams,
  ];
  const limitSlot = 6 + vehicleParams.length;
  const offsetSlot = limitSlot + 1;
  const counts = await db.query(
    `SELECT
      (COUNT(*) FILTER (WHERE ${STATUS_MATCH}))::int AS total,
      (COUNT(*) FILTER (
        WHERE flagged
          OR review_status IN ('conditional', 'fail')
          OR btrim(COALESCE(new_damage_notes, '')) <> ''
      ))::int AS flagged
    FROM checkout_reports
    WHERE ${REPORT_PAGE_FILTER}
      ${vehicleSql}`,
    params
  );
  const rows = await db.query(
    `SELECT
      id, company_id, vehicle_id, unit_number, plate, year, make, model, odometer,
      driver_name, dispatcher_name, type, status, completed_at, review_status,
      review_notes, new_damage_notes, retake_angles, reviewed_at, reviewed_by,
      flagged, created_at, signed_at, inspection_form, archived_at, sent_at,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'angle', elem.value->>'angle',
              'capturedAt', elem.value->>'capturedAt',
              'flaggedDamage', CASE WHEN elem.value->>'flaggedDamage' = 'true' THEN true ELSE NULL END,
              'damageNote', NULLIF(btrim(COALESCE(elem.value->>'damageNote', '')), '')
            )
          )
          FROM jsonb_array_elements(COALESCE(photos, '[]'::jsonb)) AS elem
        ),
        '[]'::jsonb
      ) AS photos
    FROM checkout_reports
    WHERE ${REPORT_PAGE_FILTER}
      AND ${STATUS_MATCH}
      ${vehicleSql}
    ORDER BY completed_at DESC
    LIMIT $${limitSlot}
    OFFSET $${offsetSlot}`,
    [...params, query.limit, query.offset]
  );
  return { counts: counts[0] ?? {}, rows };
}

export async function listVehicleReports(db: OrgDb, orgId: string, vehicleId: string) {
  return db.query(
    `SELECT
      id, company_id, vehicle_id, unit_number, plate, year, make, model, odometer,
      driver_name, dispatcher_name, type, status, completed_at, review_status,
      review_notes, new_damage_notes, retake_angles, reviewed_at, reviewed_by,
      flagged, photos, created_at, signed_at, inspection_form, archived_at, sent_at
    FROM checkout_reports
    WHERE org_id = $1 AND vehicle_id = $2 AND archived_at IS NULL
    ORDER BY completed_at DESC`,
    [org(orgId), vehicleId]
  );
}

export async function listReports(db: OrgDb, orgId: string) {
  return db.query(
    "SELECT * FROM checkout_reports WHERE org_id = $1 ORDER BY completed_at DESC",
    [org(orgId)]
  );
}

export async function getReport(db: OrgDb, orgId: string, id: string) {
  const rows = await db.query(
    "SELECT * FROM checkout_reports WHERE id = $1 AND org_id = $2 LIMIT 1",
    [id, org(orgId)]
  );
  return rows[0];
}

export async function backfillHistoricalSent(
  db: OrgDb,
  orgId: string,
  before: string
) {
  const rows = await db.query(
    `UPDATE checkout_reports
     SET sent_at = completed_at
     WHERE org_id = $1
       AND sent_at IS NULL
       AND created_at < $2
     RETURNING id`,
    [org(orgId), before]
  );
  return rows.length;
}

export async function markReportSent(db: OrgDb, orgId: string, id: string, sentAt: string) {
  const rows = await db.query(
    `UPDATE checkout_reports
     SET sent_at = COALESCE(sent_at, $3),
         status = CASE WHEN status = 'uploading' THEN 'complete' ELSE status END
     WHERE id = $1 AND org_id = $2
     RETURNING sent_at`,
    [id, org(orgId), sentAt]
  );
  return rows[0];
}

export async function listReportsForDriver(db: OrgDb, orgId: string, driverName: string) {
  return db.query(
    `SELECT *
     FROM checkout_reports
     WHERE org_id = $1
       AND archived_at IS NULL
       AND lower(driver_name) = lower($2)
     ORDER BY completed_at DESC
     LIMIT 30`,
    [org(orgId), driverName.trim()]
  );
}

export async function countStuckUploads(db: OrgDb, orgId: string, olderThan: string) {
  const rows = await db.query(
    `SELECT COUNT(*)::int AS stuck
     FROM checkout_reports
     WHERE org_id = $1
       AND archived_at IS NULL
       AND sent_at IS NULL
       AND created_at < $2`,
    [org(orgId), olderThan]
  );
  return Number(rows[0]?.stuck ?? 0);
}

export async function getReportByIdempotency(db: OrgDb, orgId: string, key: string) {
  const rows = await db.query(
    "SELECT * FROM checkout_reports WHERE org_id = $1 AND idempotency_key = $2 LIMIT 1",
    [org(orgId), key]
  );
  return rows[0];
}

export async function upsertReport(
  db: OrgDb,
  orgId: string,
  report: {
    id: string;
    companyId: string;
    vehicleId: string;
    unitNumber: string;
    plate: string | null;
    year: number;
    make: string;
    model: string;
    odometer: number;
    driverName: string;
    dispatcherName: string;
    type: string;
    status: string;
    completedAt: string;
    reviewStatus: string;
    reviewNotes: string | null;
    newDamageNotes: string | null;
    retakeAnglesJson: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
    flagged: boolean;
    photosJson: string;
    createdAt: string;
    signatureDataUrl: string | null;
    signedAt: string | null;
    inspectionFormJson: string;
    idempotencyKey?: string | null;
    sentAt?: string | null;
  }
) {
  await assertFleetInOrg(db, orgId, report.companyId);
  const rows = await db.query(
    `INSERT INTO checkout_reports (
      id, org_id, company_id, vehicle_id, unit_number, plate, year, make, model, odometer,
      driver_name, dispatcher_name, type, status, completed_at, review_status,
      review_notes, new_damage_notes, retake_angles, reviewed_at, reviewed_by,
      flagged, photos, created_at, signature_data_url, signed_at, inspection_form,
      idempotency_key, sent_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,
      $17,$18,CAST($19 AS jsonb),$20,$21,
      $22,CAST($23 AS jsonb),$24,$25,$26,CAST($27 AS jsonb),$28,$29
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
      inspection_form = EXCLUDED.inspection_form,
      status = CASE
        WHEN checkout_reports.status = 'complete' THEN checkout_reports.status
        ELSE EXCLUDED.status
      END,
      sent_at = COALESCE(EXCLUDED.sent_at, checkout_reports.sent_at)
    WHERE checkout_reports.org_id = EXCLUDED.org_id
    RETURNING id`,
    [
      report.id,
      org(orgId),
      report.companyId,
      report.vehicleId,
      report.unitNumber,
      report.plate,
      report.year,
      report.make,
      report.model,
      report.odometer,
      report.driverName,
      report.dispatcherName,
      report.type,
      report.status,
      report.completedAt,
      report.reviewStatus,
      report.reviewNotes,
      report.newDamageNotes,
      report.retakeAnglesJson,
      report.reviewedAt,
      report.reviewedBy,
      report.flagged,
      report.photosJson,
      report.createdAt,
      report.signatureDataUrl,
      report.signedAt,
      report.inspectionFormJson,
      report.idempotencyKey || null,
      report.sentAt || null,
    ]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function setVehicleMileage(
  db: OrgDb,
  orgId: string,
  vehicleId: string,
  odometer: number
) {
  await db.query(
    "UPDATE vehicles SET last_mileage = $1 WHERE id = $2 AND org_id = $3",
    [odometer, vehicleId, org(orgId)]
  );
}

export async function getFleetSettings(db: OrgDb, orgId: string) {
  const rows = await db.query(
    "SELECT allow_driver_add_vehicles FROM fleet_settings WHERE org_id = $1 LIMIT 1",
    [org(orgId)]
  );
  return rows[0];
}

export async function setFleetSettings(
  db: OrgDb,
  orgId: string,
  allowDriverAddVehicles: boolean
) {
  await db.query(
    `INSERT INTO fleet_settings (id, allow_driver_add_vehicles, org_id)
     VALUES ('app', $2, $1)
     ON CONFLICT (id) DO UPDATE SET
       allow_driver_add_vehicles = EXCLUDED.allow_driver_add_vehicles
     WHERE fleet_settings.org_id = EXCLUDED.org_id`,
    [org(orgId), allowDriverAddVehicles]
  );
}

let driverTallyColumnReady = false;

async function ensureDriverTallyColumn(db: OrgDb) {
  if (driverTallyColumnReady) return;
  await db.query(
    `ALTER TABLE fleet_settings ADD COLUMN IF NOT EXISTS driver_tally_sent JSONB`
  );
  driverTallyColumnReady = true;
}

export async function listDriverTallyChecks(
  db: OrgDb,
  orgId: string,
  start: string,
  end: string
) {
  return db.query(
    `SELECT r.driver_name, r.review_status, r.company_id, c.name AS company_name
     FROM checkout_reports r
     LEFT JOIN companies c ON c.id = r.company_id AND c.org_id = r.org_id
     WHERE r.org_id = $1
       AND r.archived_at IS NULL
       AND r.completed_at >= $2::timestamptz
       AND r.completed_at < $3::timestamptz`,
    [org(orgId), start, end]
  );
}

export async function readDriverTallySent(db: OrgDb, orgId: string): Promise<string[]> {
  await ensureDriverTallyColumn(db);
  const rows = await db.query(
    `SELECT driver_tally_sent FROM fleet_settings WHERE org_id = $1 LIMIT 1`,
    [org(orgId)]
  );
  const value = rows[0]?.driver_tally_sent;
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>);
}

export async function markDriverTallySent(db: OrgDb, orgId: string, key: string) {
  await ensureDriverTallyColumn(db);
  await db.query(
    `INSERT INTO fleet_settings (id, allow_driver_add_vehicles, org_id, driver_tally_sent)
     VALUES ('app', FALSE, $1, jsonb_build_object($2::text, true))
     ON CONFLICT (id) DO UPDATE SET
       driver_tally_sent = COALESCE(fleet_settings.driver_tally_sent, '{}'::jsonb)
         || EXCLUDED.driver_tally_sent
     WHERE fleet_settings.org_id = EXCLUDED.org_id`,
    [org(orgId), key]
  );
}

export async function readCompanySettings(db: OrgDb, orgId: string) {
  const rows = await db.query(
    "SELECT settings_json FROM fleet_settings WHERE org_id = $1 LIMIT 1",
    [org(orgId)]
  );
  return rows[0]?.settings_json ?? null;
}

export async function writeCompanySettings(
  db: OrgDb,
  orgId: string,
  settingsJson: string | null
) {
  await db.query(
    `INSERT INTO fleet_settings (id, allow_driver_add_vehicles, org_id, settings_json)
     VALUES ('app', FALSE, $1, CAST($2 AS jsonb))
     ON CONFLICT (id) DO UPDATE SET
       settings_json = EXCLUDED.settings_json
     WHERE fleet_settings.org_id = EXCLUDED.org_id`,
    [org(orgId), settingsJson]
  );
}

export async function setReportArchivedAt(
  db: OrgDb,
  orgId: string,
  id: string,
  archivedAt: string | null
) {
  const rows = await db.query(
    "UPDATE checkout_reports SET archived_at = $1 WHERE id = $2 AND org_id = $3 RETURNING id",
    [archivedAt, id, org(orgId)]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function deleteReport(db: OrgDb, orgId: string, id: string) {
  const scoped = org(orgId);
  await db.query(
    "DELETE FROM fleet_alerts WHERE report_id = $1 AND org_id = $2",
    [id, scoped]
  );
  const rows = await db.query(
    "DELETE FROM checkout_reports WHERE id = $1 AND org_id = $2 RETURNING id",
    [id, scoped]
  );
  return Boolean(rows[0]);
}

export async function listAlerts(db: OrgDb, orgId: string) {
  return db.query(
    "SELECT * FROM fleet_alerts WHERE org_id = $1 ORDER BY created_at DESC",
    [org(orgId)]
  );
}

export async function insertAlert(
  db: OrgDb,
  orgId: string,
  alert: {
    id: string;
    type: string;
    message: string;
    vehicleId: string;
    vehiclePlate: string;
    actorName: string;
    reportId: string | null;
    createdAt: string;
    read: boolean;
    archivedAt: string | null;
  }
) {
  await db.query(
    `INSERT INTO fleet_alerts (
      id, org_id, type, message, vehicle_id, vehicle_plate, actor_name, report_id, created_at, read, archived_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (id) DO NOTHING`,
    [
      alert.id,
      org(orgId),
      alert.type,
      alert.message,
      alert.vehicleId,
      alert.vehiclePlate,
      alert.actorName,
      alert.reportId,
      alert.createdAt,
      alert.read,
      alert.archivedAt,
    ]
  );
}

export async function setAlertArchivedAt(
  db: OrgDb,
  orgId: string,
  id: string,
  archivedAt: string | null
) {
  await db.query(
    "UPDATE fleet_alerts SET archived_at = $1 WHERE id = $2 AND org_id = $3",
    [archivedAt, id, org(orgId)]
  );
  const rows = await db.query(
    "SELECT * FROM fleet_alerts WHERE id = $1 AND org_id = $2 LIMIT 1",
    [id, org(orgId)]
  );
  return rows[0];
}

export async function deleteAlert(db: OrgDb, orgId: string, id: string) {
  const rows = await db.query(
    "DELETE FROM fleet_alerts WHERE id = $1 AND org_id = $2 RETURNING id",
    [id, org(orgId)]
  );
  return Boolean(rows[0]);
}

export async function listUsers(db: OrgDb, orgId: string) {
  return db.query(
    "SELECT * FROM app_users WHERE org_id = $1 ORDER BY name",
    [org(orgId)]
  );
}

export async function insertUser(
  db: OrgDb,
  orgId: string,
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    createdAt: string;
  }
) {
  await db.query(
    `INSERT INTO app_users (id, name, email, role, active, created_at, org_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [user.id, user.name, storedEmail(user.email), user.role, user.active, user.createdAt, org(orgId)]
  );
}

export async function getUser(db: OrgDb, orgId: string, id: string) {
  const rows = await db.query(
    "SELECT * FROM app_users WHERE id = $1 AND org_id = $2 LIMIT 1",
    [id, org(orgId)]
  );
  return rows[0];
}

export async function updateUser(
  db: OrgDb,
  orgId: string,
  id: string,
  user: { name: string; email: string; role: string; active: boolean }
) {
  const rows = await db.query(
    `UPDATE app_users
     SET name = $1, email = $2, role = $3, active = $4
     WHERE id = $5 AND org_id = $6
     RETURNING id`,
    [user.name, storedEmail(user.email), user.role, user.active, id, org(orgId)]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function insertFeedback(
  db: OrgDb,
  orgId: string,
  entry: {
    id: string;
    type: string;
    note: string | null;
    unitId: string | null;
    unitNumber: string | null;
    plate: string | null;
    pagePhase: string | null;
    photoStepJson: string | null;
    pageUrl: string | null;
    userAgent: string | null;
    userName: string | null;
    userRole: string | null;
    driverName: string | null;
    screenshotUrl: string | null;
    createdAt: string;
    deliveredVia: string;
  }
) {
  await db.query(
    `INSERT INTO app_feedback (
      id, org_id, type, note, unit_id, unit_number, plate, page_phase, photo_step,
      page_url, user_agent, user_name, user_role, driver_name, screenshot_url,
      created_at, delivered_via
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,CAST($9 AS jsonb),
      $10,$11,$12,$13,$14,$15,
      $16,$17
    )`,
    [
      entry.id,
      org(orgId),
      entry.type,
      entry.note,
      entry.unitId,
      entry.unitNumber,
      entry.plate,
      entry.pagePhase,
      entry.photoStepJson,
      entry.pageUrl,
      entry.userAgent,
      entry.userName,
      entry.userRole,
      entry.driverName,
      entry.screenshotUrl,
      entry.createdAt,
      entry.deliveredVia,
    ]
  );
}

export async function listFeedback(db: OrgDb, orgId: string) {
  return db.query(
    "SELECT * FROM app_feedback WHERE org_id = $1 ORDER BY created_at DESC LIMIT 100",
    [org(orgId)]
  );
}

export async function markFeedbackDelivered(
  db: OrgDb,
  orgId: string,
  id: string,
  deliveredVia: string
) {
  await db.query(
    "UPDATE app_feedback SET delivered_via = $1 WHERE id = $2 AND org_id = $3",
    [deliveredVia, id, org(orgId)]
  );
}

export async function seedFleetSettings(db: OrgDb, orgId: string) {
  await db.query(
    `INSERT INTO fleet_settings (id, allow_driver_add_vehicles, org_id)
     VALUES ('app', FALSE, $1)
     ON CONFLICT (id) DO NOTHING`,
    [org(orgId)]
  );
}

export async function seedUser(
  db: OrgDb,
  orgId: string,
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    createdAt: string;
  }
) {
  await db.query(
    `INSERT INTO app_users (id, name, email, role, active, created_at, org_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO NOTHING`,
    [user.id, user.name, user.email, user.role, user.active, user.createdAt, org(orgId)]
  );
}

export async function seedCompany(
  db: OrgDb,
  orgId: string,
  company: {
    id: string;
    name: string;
    slug: string;
    checklistId: string;
    createdAt: string;
  }
) {
  await db.query(
    `INSERT INTO companies (id, name, slug, checklist_id, created_at, org_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO NOTHING`,
    [company.id, company.name, company.slug, company.checklistId, company.createdAt, org(orgId)]
  );
}

export async function vehiclesOutsideFleet(db: OrgDb, orgId: string, companyId: string) {
  return db.query(
    "SELECT id, company_id, unit_number, plate FROM vehicles WHERE org_id = $1 AND company_id <> $2",
    [org(orgId), companyId]
  );
}

export async function moveVehicleToFleet(
  db: OrgDb,
  orgId: string,
  vehicleId: string,
  companyId: string
) {
  await db.query(
    "UPDATE vehicles SET company_id = $1 WHERE id = $2 AND org_id = $3",
    [companyId, vehicleId, org(orgId)]
  );
  await db.query(
    "UPDATE checkout_reports SET company_id = $1 WHERE vehicle_id = $2 AND org_id = $3",
    [companyId, vehicleId, org(orgId)]
  );
}

export async function alignReportsWithFleet(db: OrgDb, orgId: string, companyId: string) {
  await db.query(
    `UPDATE checkout_reports
     SET company_id = $1
     WHERE org_id = $2
       AND company_id <> $1
       AND vehicle_id IN (
         SELECT id FROM vehicles WHERE org_id = $2 AND company_id = $1
       )`,
    [companyId, org(orgId)]
  );
}

export async function seedVehicle(
  db: OrgDb,
  orgId: string,
  vehicle: {
    id: string;
    companyId: string;
    unitNumber: string;
    plate: string;
    make: string;
    model: string;
    year: number;
    lastMileage: number | null;
    createdAt: string;
    powertrain: string;
  }
) {
  await db.query(
    `INSERT INTO vehicles (
      id, company_id, unit_number, plate, make, model, year, last_mileage, created_at, powertrain, org_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (id) DO NOTHING`,
    [
      vehicle.id,
      vehicle.companyId,
      vehicle.unitNumber,
      vehicle.plate,
      vehicle.make,
      vehicle.model,
      vehicle.year,
      vehicle.lastMileage,
      vehicle.createdAt,
      vehicle.powertrain,
      org(orgId),
    ]
  );
}

export async function hasAnyReport(db: OrgDb, orgId: string) {
  const rows = await db.query(
    "SELECT id FROM checkout_reports WHERE org_id = $1 LIMIT 1",
    [org(orgId)]
  );
  return rows.length > 0;
}

export async function reportExists(db: OrgDb, orgId: string, id: string) {
  const rows = await db.query(
    "SELECT id FROM checkout_reports WHERE id = $1 AND org_id = $2 LIMIT 1",
    [id, org(orgId)]
  );
  return rows.length > 0;
}

/** The one checkout whose front photo was replaced by a verification upload. */
const FRONT_RESTORE_REPORT_ID = "1792511911545-kehi03k";
const FRONT_RESTORE_TEST_URL =
  "https://vgsmegupovts2rut.public.blob.vercel-storage.com/checkout/1792511911545-kehi03k/front-qpk4tUMrklIykPIKDop3I6elYvVv4r.jpg";
const FRONT_RESTORE_ORIGINAL_URL =
  "https://vgsmegupovts2rut.public.blob.vercel-storage.com/checkout/1792511911545-kehi03k/front-2EFdktrQqgi7cVSdrKAc5UfFZYSUfH.jpg";

/**
 * Point that report's front photo back at the original file when it still
 * points at the test upload. A second run matches nothing and writes nothing.
 * Does not delete the test file or change any other column or photo.
 */
export async function restoreReplacedFrontPhoto(
  db: OrgDb,
  orgId: string
): Promise<boolean> {
  const rows = await db.query(
    `UPDATE checkout_reports
     SET photos = (
       SELECT COALESCE(
         jsonb_agg(
           CASE
             WHEN elem->>'angle' = 'front' AND elem->>'dataUrl' = $2
             THEN jsonb_set(elem, '{dataUrl}', to_jsonb($3::text))
             ELSE elem
           END
           ORDER BY ord
         ),
         '[]'::jsonb
       )
       FROM jsonb_array_elements(photos) WITH ORDINALITY AS shot(elem, ord)
     )
     WHERE id = $1
       AND org_id = $4
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(photos) AS elem
         WHERE elem->>'angle' = 'front'
           AND elem->>'dataUrl' = $2
       )
     RETURNING id`,
    [
      FRONT_RESTORE_REPORT_ID,
      FRONT_RESTORE_TEST_URL,
      FRONT_RESTORE_ORIGINAL_URL,
      org(orgId),
    ]
  );
  return Boolean(rows[0]);
}

export async function findUserByEmail(db: OrgDb, orgId: string, email: string) {
  const rows = await db.query(
    `SELECT id, name, email, role, active, password_hash, phone, access_status
     FROM app_users
     WHERE org_id = $1 AND lower(email) = lower($2)
     LIMIT 1`,
    [org(orgId), email.trim()]
  );
  return rows[0];
}

export async function setUserPassword(
  db: OrgDb,
  orgId: string,
  userId: string,
  passwordHash: string
) {
  const rows = await db.query(
    `UPDATE app_users
     SET password_hash = $1
     WHERE id = $2 AND org_id = $3
     RETURNING id`,
    [passwordHash, userId, org(orgId)]
  );
  if (!rows[0]) throw new OrgAccessError();
}

export async function ensureMembership(
  db: OrgDb,
  orgId: string,
  membership: { id: string; userId: string; role: string; createdAt: string }
) {
  await db.query(
    `INSERT INTO org_memberships (id, org_id, user_id, role, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, user_id) DO NOTHING`,
    [membership.id, org(orgId), membership.userId, membership.role, membership.createdAt]
  );
}

export async function listPeople(db: OrgDb, orgId: string) {
  return db.query(
    `SELECT u.id, u.name, u.email, u.active,
            m.role AS member_role,
            (u.password_hash IS NOT NULL) AS has_password
     FROM app_users u
     LEFT JOIN org_memberships m
       ON m.user_id = u.id AND m.org_id = u.org_id
     WHERE u.org_id = $1
       AND COALESCE(u.access_status, 'active') = 'active'
     ORDER BY u.name`,
    [org(orgId)]
  );
}

export async function insertPendingUser(
  db: OrgDb,
  orgId: string,
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    createdAt: string;
  }
) {
  await db.query(
    `INSERT INTO app_users (
       id, name, email, role, active, created_at, org_id, password_hash, phone, access_status
     )
     VALUES ($1,$2,$3,'driver', FALSE, $4, $5, $6, $7, 'pending')`,
    [
      user.id,
      user.name,
      storedEmail(user.email),
      user.createdAt,
      org(orgId),
      user.passwordHash,
      user.phone,
    ]
  );
}

export async function listPendingUsers(db: OrgDb, orgId: string) {
  return db.query(
    `SELECT id, name, email, phone, created_at
     FROM app_users
     WHERE org_id = $1 AND access_status = 'pending'
     ORDER BY created_at`,
    [org(orgId)]
  );
}

export async function approvePendingUser(
  db: OrgDb,
  orgId: string,
  userId: string,
  legacyRole: string
) {
  const rows = await db.query(
    `UPDATE app_users
     SET active = TRUE, access_status = 'active', role = $1
     WHERE id = $2 AND org_id = $3 AND access_status = 'pending'
     RETURNING id`,
    [legacyRole, userId, org(orgId)]
  );
  return Boolean(rows[0]);
}

export async function denyPendingUser(db: OrgDb, orgId: string, userId: string) {
  const rows = await db.query(
    `UPDATE app_users
     SET active = FALSE, access_status = 'denied'
     WHERE id = $1 AND org_id = $2 AND access_status = 'pending'
     RETURNING id`,
    [userId, org(orgId)]
  );
  return Boolean(rows[0]);
}

export async function setMembershipRole(
  db: OrgDb,
  orgId: string,
  membership: { id: string; userId: string; role: string; createdAt: string }
) {
  await db.query(
    `INSERT INTO org_memberships (id, org_id, user_id, role, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [membership.id, org(orgId), membership.userId, membership.role, membership.createdAt]
  );
}

export async function replaceUserFleets(
  db: OrgDb,
  orgId: string,
  userId: string,
  fleetIds: string[]
) {
  const scoped = org(orgId);
  await db.query("DELETE FROM user_fleets WHERE org_id = $1 AND user_id = $2", [
    scoped,
    userId,
  ]);
  for (const fleetId of fleetIds) {
    await db.query(
      `INSERT INTO user_fleets (org_id, user_id, fleet_id)
       VALUES ($1, $2, $3)`,
      [scoped, userId, fleetId]
    );
  }
}

export async function listFleetCompanies(db: OrgDb, orgId: string, fleetIds: string[]) {
  if (fleetIds.length === 0) return [];
  const slots = fleetIds.map((_, index) => `$${index + 2}`).join(", ");
  return db.query(
    `SELECT id, company_id FROM fleets WHERE org_id = $1 AND id IN (${slots})`,
    [org(orgId), ...fleetIds]
  );
}

export async function listVehicleIdsForFleets(db: OrgDb, orgId: string, fleetIds: string[]) {
  if (fleetIds.length === 0) return [];
  const slots = fleetIds.map((_, index) => `$${index + 2}`).join(", ");
  const rows = await db.query(
    `SELECT id FROM vehicles WHERE org_id = $1 AND fleet_id IN (${slots})`,
    [org(orgId), ...fleetIds]
  );
  return rows.map((row) => String(row.id));
}

export async function listUserFleetRows(db: OrgDb, orgId: string) {
  return db.query(
    `SELECT user_id, fleet_id FROM user_fleets WHERE org_id = $1 ORDER BY user_id, fleet_id`,
    [org(orgId)]
  );
}

export async function setUserActive(db: OrgDb, orgId: string, userId: string, active: boolean) {
  const rows = await db.query(
    `UPDATE app_users SET active = $1 WHERE id = $2 AND org_id = $3 RETURNING id`,
    [active, userId, org(orgId)]
  );
  return Boolean(rows[0]);
}

export async function setUserLegacyRole(db: OrgDb, orgId: string, userId: string, role: string) {
  const rows = await db.query(
    `UPDATE app_users SET role = $1 WHERE id = $2 AND org_id = $3 RETURNING id`,
    [role, userId, org(orgId)]
  );
  return Boolean(rows[0]);
}

export async function listUserFleetIds(db: OrgDb, orgId: string, userId: string) {
  const rows = await db.query(
    `SELECT fleet_id FROM user_fleets WHERE org_id = $1 AND user_id = $2 ORDER BY fleet_id`,
    [org(orgId), userId]
  );
  return rows.map((row) => String(row.fleet_id));
}

export async function anyOwnerHasPassword(db: OrgDb, orgId: string) {
  const rows = await db.query(
    `SELECT u.id
     FROM app_users u
     JOIN org_memberships m ON m.user_id = u.id AND m.org_id = u.org_id
     WHERE u.org_id = $1
       AND m.role = 'owner'
       AND u.password_hash IS NOT NULL
     LIMIT 1`,
    [org(orgId)]
  );
  return Boolean(rows[0]);
}

export async function findOwnerWithoutPassword(db: OrgDb, orgId: string) {
  const rows = await db.query(
    `SELECT u.id, u.name, u.email
     FROM app_users u
     JOIN org_memberships m ON m.user_id = u.id AND m.org_id = u.org_id
     WHERE u.org_id = $1
       AND m.role = 'owner'
       AND u.active = TRUE
       AND u.password_hash IS NULL
     ORDER BY CASE WHEN u.id = 'user-ashley' THEN 0 ELSE 1 END, u.name
     LIMIT 1`,
    [org(orgId)]
  );
  return rows[0];
}

export async function insertMemberUser(
  db: OrgDb,
  orgId: string,
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    createdAt: string;
    passwordHash: string;
    membershipId: string;
    memberRole: string;
  }
) {
  await db.query(
    `INSERT INTO app_users (id, name, email, role, active, created_at, org_id, password_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      user.id,
      user.name,
      storedEmail(user.email),
      user.role,
      user.active,
      user.createdAt,
      org(orgId),
      user.passwordHash,
    ]
  );
  await ensureMembership(db, orgId, {
    id: user.membershipId,
    userId: user.id,
    role: user.memberRole,
    createdAt: user.createdAt,
  });
}

const ASHLEY_USER_ID = "user-ashley";
const JAMES_USER_ID = "user-james";
const OFFICE_USER_ID = "user-office";
const ASHLEY_PLACEHOLDER = "ashley@fleetcheck.local";
const JAMES_PLACEHOLDER = "james@fleetcheck.local";
const ASHLEY_EMAIL = "ashley@warecovery.com";
const JAMES_EMAIL = "james@warecovery.com";
const RETIRED_OFFICE_EMAIL = "retired-user-office@fleetcheck.local";

/**
 * One-time swap of the placeholder owner emails in 1st Choice / Rad Cab.
 * Ashley keeps her Owner account and takes the email the Office login used.
 * That Office login is deactivated and its email is freed. James keeps his
 * Owner account and takes james@warecovery.com; any other login already using
 * that address is deactivated and its sessions follow James. A second run
 * changes nothing. Report and feedback text is left as it was written.
 */
export async function applyOwnerEmailSwap(db: OrgDb, orgId: string): Promise<number> {
  const scoped = org(orgId);
  if (scoped !== FIRST_CHOICE_ORG_ID) return 0;
  let changes = 0;

  const movedSessions = await db.query(
    `UPDATE auth_sessions
     SET user_id = $2
     WHERE org_id = $1
       AND user_id = $3
       AND EXISTS (
         SELECT 1 FROM app_users
         WHERE id = $3 AND org_id = $1 AND lower(email) = $4
       )
     RETURNING token_hash`,
    [scoped, ASHLEY_USER_ID, OFFICE_USER_ID, ASHLEY_EMAIL]
  );
  changes += movedSessions.length;

  const movedInvites = await db.query(
    `UPDATE auth_invites
     SET user_id = $2
     WHERE org_id = $1
       AND user_id = $3
       AND EXISTS (
         SELECT 1 FROM app_users
         WHERE id = $3 AND org_id = $1 AND lower(email) = $4
       )
     RETURNING id`,
    [scoped, ASHLEY_USER_ID, OFFICE_USER_ID, ASHLEY_EMAIL]
  );
  changes += movedInvites.length;

  const retired = await db.query(
    `UPDATE app_users
     SET email = $2, active = FALSE
     WHERE id = $3 AND org_id = $1 AND lower(email) = $4
     RETURNING id`,
    [scoped, RETIRED_OFFICE_EMAIL, OFFICE_USER_ID, ASHLEY_EMAIL]
  );
  changes += retired.length;

  const ashley = await db.query(
    `UPDATE app_users
     SET email = $2
     WHERE id = $3
       AND org_id = $1
       AND lower(email) = $4
       AND NOT EXISTS (
         SELECT 1 FROM app_users other
         WHERE other.org_id = $1 AND other.id <> $3 AND lower(other.email) = $2
       )
     RETURNING id`,
    [scoped, ASHLEY_EMAIL, ASHLEY_USER_ID, ASHLEY_PLACEHOLDER]
  );
  changes += ashley.length;

  const ashleyCase = await db.query(
    `UPDATE app_users
     SET email = lower(email)
     WHERE id = $2 AND org_id = $1 AND lower(email) = $3 AND email <> lower(email)
     RETURNING id`,
    [scoped, ASHLEY_USER_ID, ASHLEY_EMAIL]
  );
  changes += ashleyCase.length;

  const movedJamesSessions = await db.query(
    `UPDATE auth_sessions
     SET user_id = $2
     WHERE org_id = $1
       AND user_id IN (
         SELECT id FROM app_users
         WHERE org_id = $1 AND id <> $2 AND lower(email) = $3
       )
     RETURNING token_hash`,
    [scoped, JAMES_USER_ID, JAMES_EMAIL]
  );
  changes += movedJamesSessions.length;

  const movedJamesInvites = await db.query(
    `UPDATE auth_invites
     SET user_id = $2
     WHERE org_id = $1
       AND user_id IN (
         SELECT id FROM app_users
         WHERE org_id = $1 AND id <> $2 AND lower(email) = $3
       )
     RETURNING id`,
    [scoped, JAMES_USER_ID, JAMES_EMAIL]
  );
  changes += movedJamesInvites.length;

  const retiredJames = await db.query(
    `UPDATE app_users
     SET email = 'retired-' || id || '@fleetcheck.local', active = FALSE
     WHERE org_id = $1 AND id <> $2 AND lower(email) = $3
     RETURNING id`,
    [scoped, JAMES_USER_ID, JAMES_EMAIL]
  );
  changes += retiredJames.length;

  const james = await db.query(
    `UPDATE app_users
     SET email = $2
     WHERE id = $3
       AND org_id = $1
       AND lower(email) = $4
       AND NOT EXISTS (
         SELECT 1 FROM app_users other
         WHERE other.org_id = $1 AND other.id <> $3 AND lower(other.email) = $2
       )
     RETURNING id`,
    [scoped, JAMES_EMAIL, JAMES_USER_ID, JAMES_PLACEHOLDER]
  );
  changes += james.length;

  const jamesCase = await db.query(
    `UPDATE app_users
     SET email = lower(email)
     WHERE id = $2 AND org_id = $1 AND lower(email) = $3 AND email <> lower(email)
     RETURNING id`,
    [scoped, JAMES_USER_ID, JAMES_EMAIL]
  );
  changes += jamesCase.length;

  const ashleyRow = await db.query(
    "SELECT id FROM app_users WHERE id = $1 AND org_id = $2 LIMIT 1",
    [ASHLEY_USER_ID, scoped]
  );
  if (ashleyRow[0]) {
    const membership = await db.query(
      "SELECT role FROM org_memberships WHERE org_id = $1 AND user_id = $2 LIMIT 1",
      [scoped, ASHLEY_USER_ID]
    );
    if (!membership[0]) {
      await ensureMembership(db, scoped, {
        id: `member-${ASHLEY_USER_ID}`,
        userId: ASHLEY_USER_ID,
        role: "owner",
        createdAt: new Date().toISOString(),
      });
      changes += 1;
    } else if (String(membership[0].role) !== "owner") {
      const promoted = await db.query(
        `UPDATE org_memberships
         SET role = 'owner'
         WHERE org_id = $1 AND user_id = $2 AND role <> 'owner'
         RETURNING id`,
        [scoped, ASHLEY_USER_ID]
      );
      changes += promoted.length;
    }
  }

  const ashleyInvites = await db.query(
    `UPDATE auth_invites
     SET email = $2
     WHERE org_id = $1 AND user_id = $3 AND lower(COALESCE(email, '')) = $4
     RETURNING id`,
    [scoped, ASHLEY_EMAIL, ASHLEY_USER_ID, ASHLEY_PLACEHOLDER]
  );
  changes += ashleyInvites.length;

  const jamesInvites = await db.query(
    `UPDATE auth_invites
     SET email = $2
     WHERE org_id = $1 AND user_id = $3 AND lower(COALESCE(email, '')) = $4
     RETURNING id`,
    [scoped, JAMES_EMAIL, JAMES_USER_ID, JAMES_PLACEHOLDER]
  );
  changes += jamesInvites.length;

  return changes;
}

export async function recomputeVehicleMileage(
  db: OrgDb,
  orgId: string,
  vehicleId?: string | null
): Promise<{ cleared: number; fromLive: number }> {
  const rows = await db.query(
    `UPDATE vehicles v
     SET last_mileage = (
       SELECT r.odometer
       FROM checkout_reports r
       WHERE r.org_id = v.org_id
         AND r.vehicle_id = v.id
         AND r.archived_at IS NULL
       ORDER BY r.completed_at DESC, r.created_at DESC
       LIMIT 1
     )
     WHERE v.org_id = $1
       AND ($2::text IS NULL OR v.id = $2::text)
     RETURNING last_mileage`,
    [org(orgId), vehicleId || null]
  );
  let cleared = 0;
  let fromLive = 0;
  for (const row of rows) {
    if (row.last_mileage == null) cleared += 1;
    else fromLive += 1;
  }
  return { cleared, fromLive };
}

export interface RolloutAccountChange {
  id: string;
  name: string;
  email: string;
  reason: string;
  alreadyInactive: boolean;
}

export interface RolloutSlateResult {
  alreadyApplied: boolean;
  appliedAt: string | null;
  before: { openReports: number; pendingReports: number; openAlerts: number };
  after: { openReports: number; pendingReports: number; openAlerts: number };
  archivedReports: number;
  archivedAlerts: number;
  deactivated: RolloutAccountChange[];
  kept: Array<{ id: string; name: string; email: string; reason: string }>;
  ambiguous: Array<{ id: string; name: string; email: string; reason: string }>;
  mileageCleared: number;
  mileageFromLive: number;
}

async function slateCounts(db: OrgDb, orgId: string) {
  const scoped = org(orgId);
  const reports = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE archived_at IS NULL)::int AS open_reports,
       COUNT(*) FILTER (
         WHERE archived_at IS NULL AND review_status = 'pending'
       )::int AS pending_reports
     FROM checkout_reports
     WHERE org_id = $1`,
    [scoped]
  );
  const alerts = await db.query(
    `SELECT COUNT(*) FILTER (WHERE archived_at IS NULL)::int AS open_alerts
     FROM fleet_alerts
     WHERE org_id = $1`,
    [scoped]
  );
  return {
    openReports: Number(reports[0]?.open_reports ?? 0),
    pendingReports: Number(reports[0]?.pending_reports ?? 0),
    openAlerts: Number(alerts[0]?.open_alerts ?? 0),
  };
}

/**
 * Archive pre-rollout reports and alerts, deactivate demo logins, and
 * rebuild last mileage from reports that are still visible.
 * Does not delete rows, Blob photos, PDFs, or Slack messages.
 * A second run logs the current counts and changes nothing.
 */
export async function applyRolloutSlate(
  db: OrgDb,
  orgId: string,
  appliedAt: string
): Promise<RolloutSlateResult | null> {
  const scoped = org(orgId);
  if (scoped !== FIRST_CHOICE_ORG_ID) return null;
  await db.query(
    `ALTER TABLE fleet_settings ADD COLUMN IF NOT EXISTS rollout_slate_at TIMESTAMPTZ`
  );
  const marker = await db.query(
    `SELECT rollout_slate_at FROM fleet_settings WHERE org_id = $1 LIMIT 1`,
    [scoped]
  );
  const existing = marker[0]?.rollout_slate_at;
  if (existing) {
    const counts = await slateCounts(db, scoped);
    return {
      alreadyApplied: true,
      appliedAt: new Date(String(existing)).toISOString(),
      before: counts,
      after: counts,
      archivedReports: 0,
      archivedAlerts: 0,
      deactivated: [],
      kept: [],
      ambiguous: [],
      mileageCleared: 0,
      mileageFromLive: 0,
    };
  }

  const before = await slateCounts(db, scoped);
  const cutoff = rolloutSlateCutoffIso();
  const archivedReports = await db.query(
    `UPDATE checkout_reports
     SET archived_at = $2
     WHERE org_id = $1
       AND archived_at IS NULL
       AND created_at < $3::timestamptz
     RETURNING id`,
    [scoped, appliedAt, cutoff]
  );
  const archivedAlerts = await db.query(
    `UPDATE fleet_alerts
     SET archived_at = $2
     WHERE org_id = $1
       AND archived_at IS NULL
       AND created_at < $3::timestamptz
     RETURNING id`,
    [scoped, appliedAt, cutoff]
  );

  const users = await db.query(
    `SELECT u.id, u.name, u.email, u.active, u.created_at,
            m.created_at AS approved_at
     FROM app_users u
     LEFT JOIN org_memberships m
       ON m.org_id = u.org_id AND m.user_id = u.id
     WHERE u.org_id = $1
     ORDER BY u.email`,
    [scoped]
  );

  const deactivated: RolloutAccountChange[] = [];
  const kept: RolloutSlateResult["kept"] = [];
  const ambiguous: RolloutSlateResult["ambiguous"] = [];
  for (const row of users) {
    const id = String(row.id);
    const name = String(row.name);
    const email = String(row.email);
    const decision: RolloutUserDecision = rolloutUserDecision({
      id,
      name,
      email,
      createdAt: new Date(String(row.created_at)).toISOString(),
      approvedAt: row.approved_at
        ? new Date(String(row.approved_at)).toISOString()
        : null,
    });
    if (decision.action === "keep") {
      kept.push({ id, name, email, reason: decision.reason });
      continue;
    }
    if (decision.action === "ambiguous") {
      ambiguous.push({ id, name, email, reason: decision.reason });
      continue;
    }
    const updated = await db.query(
      `UPDATE app_users
       SET active = FALSE
       WHERE org_id = $1 AND id = $2 AND active = TRUE
       RETURNING id`,
      [scoped, id]
    );
    await db.query(
      `DELETE FROM auth_sessions WHERE org_id = $1 AND user_id = $2`,
      [scoped, id]
    );
    deactivated.push({
      id,
      name,
      email,
      reason: decision.reason,
      alreadyInactive: updated.length === 0,
    });
  }

  const mileage = await recomputeVehicleMileage(db, scoped, null);
  const after = await slateCounts(db, scoped);
  await db.query(
    `UPDATE fleet_settings
     SET rollout_slate_at = $2
     WHERE org_id = $1 AND rollout_slate_at IS NULL`,
    [scoped, appliedAt]
  );
  return {
    alreadyApplied: false,
    appliedAt,
    before,
    after,
    archivedReports: archivedReports.length,
    archivedAlerts: archivedAlerts.length,
    deactivated,
    kept,
    ambiguous,
    mileageCleared: mileage.cleared,
    mileageFromLive: mileage.fromLive,
  };
}

/**
 * Record that Manager exists. Existing Office memberships stay Office.
 * A second run does not change any person.
 */
export async function applyManagerRoleMigration(
  db: OrgDb,
  orgId: string,
  appliedAt: string
): Promise<{ alreadyApplied: boolean; officeCount: number }> {
  const scoped = org(orgId);
  await db.query(
    `ALTER TABLE fleet_settings ADD COLUMN IF NOT EXISTS manager_role_at TIMESTAMPTZ`
  );
  await db.query(`ALTER TABLE auth_invites ADD COLUMN IF NOT EXISTS fleet_ids TEXT`);
  const office = await db.query(
    `SELECT COUNT(*)::int AS office_count
     FROM org_memberships
     WHERE org_id = $1 AND role = 'office'`,
    [scoped]
  );
  const officeCount = Number(office[0]?.office_count ?? 0);
  const marker = await db.query(
    `SELECT manager_role_at FROM fleet_settings WHERE org_id = $1 LIMIT 1`,
    [scoped]
  );
  if (marker[0]?.manager_role_at) {
    return { alreadyApplied: true, officeCount };
  }
  await db.query(
    `UPDATE fleet_settings
     SET manager_role_at = $2
     WHERE org_id = $1 AND manager_role_at IS NULL`,
    [scoped, appliedAt]
  );
  return { alreadyApplied: false, officeCount };
}

export type SlackDeliveryKind = "checkout" | "stall";

export async function insertSlackDelivery(
  db: OrgDb,
  input: { id: string; orgId: string; reportId: string; kind: SlackDeliveryKind }
): Promise<{ attempts: number; body: string | null } | undefined> {
  const rows = await db.query(
    `INSERT INTO slack_deliveries (
       id, org_id, report_id, kind, status, attempts, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, 'sending', 1, NOW(), NOW())
     ON CONFLICT (org_id, report_id, kind) DO NOTHING
     RETURNING attempts, body`,
    [input.id, org(input.orgId), input.reportId, input.kind]
  );
  return deliveryClaim(rows[0]);
}

export async function claimFailedSlackDelivery(
  db: OrgDb,
  input: { orgId: string; reportId: string; kind: SlackDeliveryKind; cap: number }
): Promise<{ attempts: number; body: string | null } | undefined> {
  const rows = await db.query(
    `UPDATE slack_deliveries
     SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
     WHERE org_id = $1 AND report_id = $2 AND kind = $3
       AND status = 'failed'
       AND attempts < $4
       AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
     RETURNING attempts, body`,
    [org(input.orgId), input.reportId, input.kind, input.cap]
  );
  return deliveryClaim(rows[0]);
}

/**
 * A checkout that already has a Slack message can resume file uploads after
 * the request died. A row still sending with no message id is left alone.
 */
export async function claimStuckSlackDelivery(
  db: OrgDb,
  input: { orgId: string; reportId: string; kind: SlackDeliveryKind; cap: number }
): Promise<{ attempts: number; body: string | null } | undefined> {
  const rows = await db.query(
    `UPDATE slack_deliveries
     SET attempts = attempts + 1, updated_at = NOW()
     WHERE org_id = $1 AND report_id = $2 AND kind = $3
       AND status = 'sending'
       AND attempts < $4
       AND body LIKE '%"ts":%'
       AND updated_at <= NOW() - INTERVAL '10 minutes'
     RETURNING attempts, body`,
    [org(input.orgId), input.reportId, input.kind, input.cap]
  );
  return deliveryClaim(rows[0]);
}

function deliveryClaim(
  row: Record<string, unknown> | undefined
): { attempts: number; body: string | null } | undefined {
  if (!row || row.attempts == null) return undefined;
  return {
    attempts: Number(row.attempts),
    body: row.body == null ? null : String(row.body),
  };
}

export async function saveSlackDeliveryBody(
  db: OrgDb,
  input: { orgId: string; reportId: string; kind: SlackDeliveryKind; body: string }
): Promise<void> {
  await db.query(
    `UPDATE slack_deliveries
     SET body = $4, updated_at = NOW()
     WHERE org_id = $1 AND report_id = $2 AND kind = $3 AND status = 'sending'`,
    [org(input.orgId), input.reportId, input.kind, input.body]
  );
}

export async function finishSlackDelivery(
  db: OrgDb,
  input: {
    orgId: string;
    reportId: string;
    kind: SlackDeliveryKind;
    status: "sent" | "failed" | "dead" | "skipped";
    error?: string | null;
    nextAttemptAt?: string | null;
  }
): Promise<void> {
  await db.query(
    `UPDATE slack_deliveries
     SET status = $4,
         last_error = $5,
         next_attempt_at = $6,
         sent_at = CASE WHEN $4 = 'sent' THEN NOW() ELSE sent_at END,
         updated_at = NOW()
     WHERE org_id = $1 AND report_id = $2 AND kind = $3 AND status = 'sending'`,
    [
      org(input.orgId),
      input.reportId,
      input.kind,
      input.status,
      input.error ?? null,
      input.nextAttemptAt ?? null,
    ]
  );
}

export async function checkoutDeliveryStatus(
  db: OrgDb,
  orgId: string,
  reportId: string
): Promise<string | null> {
  const rows = await db.query(
    `SELECT status
     FROM slack_deliveries
     WHERE org_id = $1 AND report_id = $2 AND kind = 'checkout'
     LIMIT 1`,
    [org(orgId), reportId]
  );
  return rows[0]?.status == null ? null : String(rows[0].status);
}

/** Let an owner or the daily job try a checkout that never landed. Keeps a thread id. */
export async function reopenCheckoutDelivery(
  db: OrgDb,
  orgId: string,
  reportId: string
): Promise<void> {
  await db.query(
    `UPDATE slack_deliveries
     SET status = 'failed',
         attempts = 1,
         next_attempt_at = NOW(),
         last_error = NULL,
         updated_at = NOW()
     WHERE org_id = $1 AND report_id = $2 AND kind = 'checkout'
       AND status <> 'sent'`,
    [org(orgId), reportId]
  );
}

/** Sent Rad Cab checks from the last day that never got a successful Slack post. */
export async function listRadCabUnpostedCheckouts(
  db: OrgDb,
  input: { orgId: string; companyId: string; oldest: string; limit: number }
): Promise<string[]> {
  const rows = await db.query(
    `SELECT r.id
     FROM checkout_reports r
     WHERE r.org_id = $1
       AND r.company_id = $2
       AND r.archived_at IS NULL
       AND r.sent_at IS NOT NULL
       AND r.created_at >= $3::timestamptz
       AND NOT EXISTS (
         SELECT 1 FROM slack_deliveries d
         WHERE d.org_id = r.org_id
           AND d.report_id = r.id
           AND d.kind = 'checkout'
           AND d.status = 'sent'
       )
     ORDER BY r.created_at
     LIMIT $4`,
    [org(input.orgId), input.companyId, input.oldest, input.limit]
  );
  return rows.map((row) => String(row.id));
}

export async function listDueSlackDeliveries(
  db: OrgDb,
  orgId: string,
  cap: number,
  limit: number
): Promise<Array<{ reportId: string; kind: SlackDeliveryKind; attempts: number }>> {
  const rows = await db.query(
     `SELECT report_id, kind, attempts
     FROM slack_deliveries
     WHERE org_id = $1
       AND attempts < $2
       AND (
         (status = 'failed' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))
         OR (
           status = 'sending'
           AND kind = 'checkout'
           AND body LIKE '%"ts":%'
           AND updated_at <= NOW() - INTERVAL '10 minutes'
         )
       )
     ORDER BY next_attempt_at NULLS FIRST
     LIMIT $3`,
    [org(orgId), cap, limit]
  );
  return rows.map((row) => ({
    reportId: String(row.report_id),
    kind: String(row.kind) as SlackDeliveryKind,
    attempts: Number(row.attempts),
  }));
}

export async function listRadCabStallCandidates(
  db: OrgDb,
  input: { orgId: string; companyId: string; oldest: string; newest: string; limit: number }
): Promise<
  Array<{
    id: string;
    unitNumber: string;
    plate: string;
    driverName: string;
    dispatcherName: string;
    createdAt: string;
    photoAngles: string[];
  }>
> {
  const rows = await db.query(
    `SELECT r.id, r.unit_number, r.plate, r.driver_name, r.dispatcher_name, r.created_at,
            COALESCE(
              (
                SELECT jsonb_agg(elem.value->>'angle')
                FROM jsonb_array_elements(COALESCE(r.photos, '[]'::jsonb)) AS elem
              ),
              '[]'::jsonb
            ) AS photo_angles
     FROM checkout_reports r
     WHERE r.org_id = $1
       AND r.company_id = $2
       AND r.archived_at IS NULL
       AND r.sent_at IS NULL
       AND r.created_at <= $3::timestamptz
       AND r.created_at >= $4::timestamptz
       AND NOT EXISTS (
         SELECT 1 FROM slack_deliveries d
         WHERE d.org_id = r.org_id AND d.report_id = r.id AND d.kind = 'stall'
       )
     ORDER BY r.created_at
     LIMIT $5`,
    [org(input.orgId), input.companyId, input.newest, input.oldest, input.limit]
  );
  return rows.map((row) => {
    const raw = row.photo_angles;
    const angles = Array.isArray(raw)
      ? raw.map((angle) => String(angle))
      : typeof raw === "string"
        ? (JSON.parse(raw) as unknown[]).map((angle) => String(angle))
        : [];
    return {
      id: String(row.id),
      unitNumber: String(row.unit_number || ""),
      plate: String(row.plate || ""),
      driverName: String(row.driver_name || ""),
      dispatcherName: String(row.dispatcher_name || ""),
      createdAt: new Date(String(row.created_at)).toISOString(),
      photoAngles: angles.filter(Boolean),
    };
  });
}

export async function deleteMemberUser(db: OrgDb, orgId: string, userId: string) {
  await db.query("DELETE FROM user_fleets WHERE user_id = $1 AND org_id = $2", [
    userId,
    org(orgId),
  ]);
  await db.query(
    "DELETE FROM org_memberships WHERE user_id = $1 AND org_id = $2",
    [userId, org(orgId)]
  );
  const rows = await db.query(
    "DELETE FROM app_users WHERE id = $1 AND org_id = $2 RETURNING id",
    [userId, org(orgId)]
  );
  return Boolean(rows[0]);
}
