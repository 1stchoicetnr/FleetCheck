import {
  mergeCompanySettings,
  parseCompanySettings,
  publicCompanySettings,
  slackWebhookOverride,
  usesClover,
  type CompanySettingsPatch,
  type PublicCompanySettings,
} from "@/lib/company-settings";
import { displayPlate, generateId } from "@/lib/utils";
import {
  CheckoutReport,
  Company,
  PhotoAngle,
  VehicleKnownIssue,
  VehiclePhoto,
} from "@/lib/types";
import {
  inferPowertrain,
  inspectionFormFlagsReport,
  Powertrain,
  validateInspectionForm,
} from "@/lib/inspection-form";
import { earlierReports } from "@/lib/report-priors";
import { cleanDamageNote, reportHasPhotoDamage, resolveDamageNote } from "@/lib/photo-flags";
import {
  OfficeListQuery,
  officeReportPage,
  pageOfficeReports,
  toOfficeListReport,
} from "@/lib/office-list";
import {
  VEHICLE_ARCHIVED_MESSAGE,
  isVehicleArchived,
} from "@/lib/vehicle-archive";
import {
  localDeleteFleet,
  localFindVehicleByPlate,
  localFindReportByIdempotency,
  localGetReport,
  localGetVehicle,
  localInsertFleet,
  localListCompanies,
  localListFleets,
  localDeleteReport,
  localInsertUser,
  localListAlerts,
  localListUsers,
  localUpdateFleet,
  localUpdateUser,
  localDeleteAlert,
  localListReports,
  localListVehicles,
  localPatchReport,
  localPutReport,
  localSetAlertArchived,
  localSetReportArchived,
  localSetVehicleArchived,
  localSetVehiclePowertrain,
  localSetVehicleService,
  localUpsertVehicle,
  localGetFleetSettings,
  localReadCompanySettings,
  localSetFleetSettings,
  localWriteCompanySettings,
} from "./local-store";
import { deleteStoredPhoto, persistCheckoutPhoto } from "./photo-store";
import { recordCheckoutAlerts } from "./report-alerts";
import { notifyCheckoutReport } from "./slack-notify";
import { assertIdempotencyKey, isUniqueViolation } from "@/lib/checkout-idempotency";
import { isStuckUpload, STUCK_UPLOAD_AFTER_MS } from "@/lib/delivery-status";
import {
  pgAssertFleetInOrg,
  pgDeleteFleet,
  pgFindVehicleByPlate,
  pgCountStuckUploads,
  pgFindReportByIdempotency,
  pgGetReport,
  pgListReportsForDriver,
  pgMarkReportSent,
  pgGetVehicle,
  pgInsertFleet,
  pgListCompanies,
  pgListFleets,
  pgDeleteAlert,
  pgDeleteReport,
  pgInsertUser,
  pgListAlerts,
  pgListUsers,
  pgUpdateFleet,
  pgUpdateUser,
  pgListReportPage,
  pgListReports,
  pgListVehicleReports,
  pgListVehicles,
  pgPutReport,
  pgSetAlertArchived,
  pgSetReportArchived,
  pgSetVehicleArchived,
  pgSetVehiclePowertrain,
  pgSetVehicleService,
  pgUpsertVehicle,
  pgGetFleetSettings,
  pgReadCompanySettings,
  pgSetFleetSettings,
  pgWriteCompanySettings,
} from "./postgres-store";
import { OrgAccessError } from "./org-scope";
import { sharedBackendMode } from "./shared-config";
import {
  CheckoutReportInput,
  CheckoutReviewInput,
  ListVehiclesOptions,
  SharedAppUser,
  SharedFleet,
  SharedOfficeAlert,
  SharedVehicle,
  UpsertVehicleInput,
} from "./shared-types";
import type { FleetSettings } from "@/lib/fleet-settings";

export class SharedBackendError extends Error {
  status: number;
  constructor(message: string, status = 503) {
    super(message);
    this.status = status;
  }
}

function assertConfigured() {
  const mode = sharedBackendMode();
  if (mode === "unconfigured") {
    throw new SharedBackendError(
      "Shared backend is not configured. Set DATABASE_URL (Neon / Vercel Postgres) and BLOB_READ_WRITE_TOKEN on Vercel.",
      503
    );
  }
  return mode;
}

async function assertFleet(
  mode: "postgres" | "local-dev",
  orgId: string,
  fleetId?: string | null
) {
  if (!fleetId) return;
  if (mode === "postgres") {
    await pgAssertFleetInOrg(orgId, fleetId);
    return;
  }
  const companies = await localListCompanies();
  if (!companies.some((company) => company.id === fleetId)) {
    throw new OrgAccessError();
  }
}

export async function listCompanies(orgId: string): Promise<Company[]> {
  const mode = assertConfigured();
  const companies =
    mode === "postgres" ? await pgListCompanies(orgId) : await localListCompanies();
  return companies.sort((a, b) => {
    if (a.slug === "rad-cab") return -1;
    if (b.slug === "rad-cab") return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function listFleets(
  orgId: string,
  options?: { includeArchived?: boolean }
): Promise<SharedFleet[]> {
  const mode = assertConfigured();
  const includeArchived = Boolean(options?.includeArchived);
  const fleets =
    mode === "postgres"
      ? await pgListFleets(orgId, includeArchived)
      : await localListFleets(includeArchived);
  return [...fleets].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFleet(
  orgId: string,
  input: { name: string; type: string; companyId: string }
): Promise<SharedFleet> {
  const mode = assertConfigured();
  await assertFleet(mode, orgId, input.companyId);
  const fleet: SharedFleet = {
    id: generateId(),
    name: input.name.trim(),
    type: input.type,
    companyId: input.companyId,
    createdAt: new Date().toISOString(),
  };
  return mode === "postgres" ? pgInsertFleet(orgId, fleet) : localInsertFleet(fleet);
}

export async function updateFleet(
  orgId: string,
  id: string,
  patch: { name?: string; archived?: boolean }
): Promise<SharedFleet> {
  const mode = assertConfigured();
  const fleet =
    mode === "postgres"
      ? await pgUpdateFleet(orgId, id, patch)
      : await localUpdateFleet(id, patch);
  if (!fleet) throw new SharedBackendError("Fleet not found", 404);
  return fleet;
}

export async function deleteFleet(orgId: string, id: string): Promise<void> {
  const mode = assertConfigured();
  const removed = mode === "postgres" ? await pgDeleteFleet(orgId, id) : await localDeleteFleet(id);
  if (!removed) throw new SharedBackendError("Fleet not found", 404);
}

export async function listVehicles(
  orgId: string,
  companyId?: string,
  options?: ListVehiclesOptions
): Promise<SharedVehicle[]> {
  const mode = assertConfigured();
  await assertFleet(mode, orgId, companyId);
  const vehicles =
    mode === "postgres"
      ? await pgListVehicles(orgId, companyId, options)
      : await localListVehicles(companyId, options);
  return [...vehicles].sort((a, b) =>
    a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
  );
}

export async function getVehicle(orgId: string, id: string): Promise<SharedVehicle | undefined> {
  const mode = assertConfigured();
  return mode === "postgres" ? pgGetVehicle(orgId, id) : localGetVehicle(id);
}

export async function findVehicleByPlate(
  orgId: string,
  companyId: string,
  plate: string
): Promise<SharedVehicle | undefined> {
  const mode = assertConfigured();
  await assertFleet(mode, orgId, companyId);
  return mode === "postgres"
    ? pgFindVehicleByPlate(orgId, companyId, plate)
    : localFindVehicleByPlate(companyId, plate);
}

export async function upsertVehicle(
  orgId: string,
  input: UpsertVehicleInput
): Promise<SharedVehicle> {
  const mode = assertConfigured();
  await assertFleet(mode, orgId, input.companyId);
  if (!input.companyId || !input.plate.trim() || !input.make.trim() || !input.model.trim()) {
    throw new SharedBackendError("Plate, make, and model are required", 400);
  }
  if (Number.isNaN(Number(input.year))) {
    throw new SharedBackendError("Year must be a number", 400);
  }
  if (input.powertrain && input.powertrain !== "ev" && input.powertrain !== "gas") {
    throw new SharedBackendError("Powertrain must be gas or ev", 400);
  }
  if (input.fleetId) {
    const fleet = (await listFleets(orgId, { includeArchived: true })).find(
      (item) => item.id === input.fleetId
    );
    if (!fleet || fleet.companyId !== input.companyId) throw new OrgAccessError();
  }
  const existing = await findVehicleByPlate(orgId, input.companyId, input.plate);
  if (existing && isVehicleArchived(existing)) {
    throw new SharedBackendError(VEHICLE_ARCHIVED_MESSAGE, 409);
  }
  return mode === "postgres" ? pgUpsertVehicle(orgId, input) : localUpsertVehicle(input);
}

export async function setVehicleArchived(
  orgId: string,
  id: string,
  archived: boolean
): Promise<SharedVehicle> {
  const mode = assertConfigured();
  const vehicle =
    mode === "postgres"
      ? await pgSetVehicleArchived(orgId, id, archived)
      : await localSetVehicleArchived(id, archived);
  if (!vehicle) {
    throw new SharedBackendError("Unit not found", 404);
  }
  return vehicle;
}

export async function setVehiclePowertrain(
  orgId: string,
  id: string,
  powertrain: Powertrain
): Promise<SharedVehicle> {
  const mode = assertConfigured();
  if (powertrain !== "ev" && powertrain !== "gas") {
    throw new SharedBackendError("Powertrain must be gas or ev", 400);
  }
  const vehicle =
    mode === "postgres"
      ? await pgSetVehiclePowertrain(orgId, id, powertrain)
      : await localSetVehiclePowertrain(id, powertrain);
  if (!vehicle) {
    throw new SharedBackendError("Unit not found", 404);
  }
  return vehicle;
}

const KNOWN_ISSUE_MAX = 1000;
const OIL_MILEAGE_MAX = 2_000_000;

export async function setVehicleService(
  orgId: string,
  id: string,
  patch: {
    knownIssue?: VehicleKnownIssue | null;
    lastOilChangeMileage?: number | null;
  }
): Promise<SharedVehicle> {
  const mode = assertConfigured();
  const next: {
    knownIssue?: VehicleKnownIssue | null;
    lastOilChangeMileage?: number | null;
  } = {};
  if (patch.knownIssue !== undefined) {
    if (patch.knownIssue === null) {
      next.knownIssue = null;
    } else {
      const text = patch.knownIssue.text?.trim() ?? "";
      if (text.length > KNOWN_ISSUE_MAX) {
        throw new SharedBackendError("Known issue is too long", 400);
      }
      if (typeof patch.knownIssue.isOpen !== "boolean") {
        throw new SharedBackendError("Known issue isOpen must be true or false", 400);
      }
      next.knownIssue = text
        ? {
            text,
            isOpen: patch.knownIssue.isOpen,
            updatedAt: patch.knownIssue.updatedAt || new Date().toISOString(),
            updatedBy: patch.knownIssue.updatedBy,
            updatedByName: patch.knownIssue.updatedByName,
          }
        : null;
    }
  }
  if (patch.lastOilChangeMileage !== undefined) {
    if (patch.lastOilChangeMileage === null) {
      next.lastOilChangeMileage = null;
    } else {
      const mileage = patch.lastOilChangeMileage;
      if (!Number.isInteger(mileage) || mileage < 0 || mileage > OIL_MILEAGE_MAX) {
        throw new SharedBackendError(
          "Oil change mileage must be a whole number from 0 to 2000000",
          400
        );
      }
      next.lastOilChangeMileage = mileage;
    }
  }
  const vehicle =
    mode === "postgres"
      ? await pgSetVehicleService(orgId, id, next)
      : await localSetVehicleService(id, next);
  if (!vehicle) throw new SharedBackendError("Unit not found", 404);
  return vehicle;
}

export async function listReports(
  orgId: string,
  options?: {
    includeArchived?: boolean;
  }
): Promise<CheckoutReport[]> {
  const mode = assertConfigured();
  const reports = mode === "postgres" ? await pgListReports(orgId) : await localListReports();
  if (options?.includeArchived) return reports;
  return reports.filter((report) => !report.archivedAt);
}

export async function listReportPage(orgId: string, query: OfficeListQuery) {
  const mode = assertConfigured();
  await assertFleet(mode, orgId, query.companyId);
  const { limit, offset } = officeReportPage(query);
  if (mode === "postgres") {
    const status = query.status && query.status !== "all" ? query.status : null;
    const page = await pgListReportPage(orgId, {
      includeArchived: query.includeArchived,
      companyId: query.companyId,
      vehicleId: query.vehicleId,
      status,
      limit,
      offset,
    });
    const olderThan = new Date(Date.now() - STUCK_UPLOAD_AFTER_MS).toISOString();
    return {
      ...page,
      reports: page.reports.map(toOfficeListReport),
      stuck: await pgCountStuckUploads(orgId, olderThan),
      limit,
      offset,
    };
  }
  const local = pageOfficeReports(await localListReports(), { ...query, limit, offset });
  const stuck = (await localListReports()).filter((report) => isStuckUpload(report)).length;
  return { ...local, stuck };
}

export async function listMyReports(orgId: string, driverName: string): Promise<CheckoutReport[]> {
  const mode = assertConfigured();
  const name = driverName.trim();
  if (!name) return [];
  if (mode === "postgres") return pgListReportsForDriver(orgId, name);
  const reports = await localListReports();
  return reports
    .filter(
      (report) =>
        !report.archivedAt && report.driverName.trim().toLowerCase() === name.toLowerCase()
    )
    .slice(0, 30);
}

export async function confirmReportSent(orgId: string, id: string): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const existing = await getReport(orgId, id);
  if (!existing) throw new SharedBackendError("Checkout report not found", 404);
  if (existing.sentAt) return existing;
  const sentAt = new Date().toISOString();
  if (mode === "postgres") {
    const stored = await pgMarkReportSent(orgId, id, sentAt);
    return { ...existing, sentAt: stored || sentAt };
  }
  const saved = await localPutReport({ ...existing, sentAt });
  return saved;
}

export async function getReport(orgId: string, id: string): Promise<CheckoutReport | undefined> {
  const mode = assertConfigured();
  return mode === "postgres" ? pgGetReport(orgId, id) : localGetReport(id);
}

export async function getPriorReports(
  orgId: string,
  vehicleId: string,
  currentId?: string,
  limit = 2
): Promise<CheckoutReport[]> {
  const mode = assertConfigured();
  const reports =
    mode === "postgres"
      ? await pgListVehicleReports(orgId, vehicleId)
      : (await localListReports()).filter(
          (report) => report.vehicleId === vehicleId && !report.archivedAt
        );
  if (!currentId) return reports.slice(0, limit);
  const current =
    reports.find((report) => report.id === currentId) ?? (await getReport(orgId, currentId));
  if (!current) return reports.slice(0, limit);
  return earlierReports(
    reports.filter((report) => report.vehicleId === current.vehicleId),
    current,
    limit
  );
}

async function reportForIdempotencyKey(
  mode: "postgres" | "local-dev",
  orgId: string,
  key: string | undefined
): Promise<CheckoutReport | undefined> {
  if (!key) return undefined;
  return mode === "postgres"
    ? pgFindReportByIdempotency(orgId, key)
    : localFindReportByIdempotency(key);
}

export async function createReport(
  orgId: string,
  input: CheckoutReportInput
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  if (input.idempotencyKey) {
    try {
      assertIdempotencyKey(input.idempotencyKey);
    } catch {
      throw new SharedBackendError("Idempotency key is invalid", 400);
    }
  }
  const replay = await reportForIdempotencyKey(mode, orgId, input.idempotencyKey);
  if (replay) return replay;
  await assertFleet(mode, orgId, input.companyId);
  const now = new Date().toISOString();
  let vehicle =
    (await getVehicle(orgId, input.vehicleId)) ||
    (input.plate
      ? await findVehicleByPlate(orgId, input.companyId, input.plate)
      : undefined);
  if (!input.signatureDataUrl?.trim()) {
    throw new SharedBackendError("Driver signature is required", 400);
  }
  const powertrain = inferPowertrain(
    input.make,
    input.model,
    vehicle?.powertrain
  );
  const settingsDoc = await readStoredCompanySettings(orgId);
  const published = publicCompanySettings(settingsDoc);
  const inspection = validateInspectionForm(input.inspectionForm, powertrain, {
    includeClover: usesClover(published, input.companyId),
  });
  if (!inspection.ok) {
    throw new SharedBackendError(inspection.error, 400);
  }
  if (vehicle && isVehicleArchived(vehicle)) {
    throw new SharedBackendError(VEHICLE_ARCHIVED_MESSAGE, 409);
  }
  if (!vehicle) {
    vehicle = await upsertVehicle(orgId, {
      companyId: input.companyId,
      unitNumber: input.unitNumber,
      plate: input.plate || input.unitNumber,
      make: input.make,
      model: input.model,
      year: input.year,
    });
  }
  const plate = displayPlate(input.plate || vehicle.plate || input.unitNumber);
  const report: CheckoutReport = {
    id: generateId(),
    ...input,
    vehicleId: vehicle.id,
    unitNumber: input.unitNumber || vehicle.unitNumber,
    plate,
    inspectionForm: {
      ...inspection.form,
      inspectedAt: inspection.form.inspectedAt || now,
    },
    photos: [],
    status: "complete",
    completedAt: now,
    reviewStatus: "pending",
    flagged: inspectionFormFlagsReport(inspection.form),
    synced: true,
    createdAt: now,
    signatureDataUrl: input.signatureDataUrl,
    signedAt: input.signedAt,
    idempotencyKey: input.idempotencyKey,
  };
  let saved: CheckoutReport;
  try {
    saved =
      mode === "postgres" ? await pgPutReport(orgId, report) : await localPutReport(report);
  } catch (err) {
    const raced = await reportForIdempotencyKey(mode, orgId, input.idempotencyKey);
    if (raced && isUniqueViolation(err)) return raced;
    throw err;
  }
  if (saved.id !== report.id) return saved;
  void notifyCheckoutReport(saved, {
    webhookUrl: slackWebhookOverride(settingsDoc),
    usesClover: usesClover(published, saved.companyId),
  });
  void recordCheckoutAlerts(orgId, saved).catch((err) => {
    console.error("[alerts] checkout report alerts failed:", err);
  });
  return saved;
}

export async function addReportPhoto(
  orgId: string,
  reportId: string,
  angle: PhotoAngle,
  dataUrl: string,
  capturedAt?: string,
  flags?: { flaggedDamage?: boolean; damageNote?: string }
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const existing =
    mode === "postgres" ? await pgGetReport(orgId, reportId) : await localGetReport(reportId);
  if (!existing) {
    throw new SharedBackendError("Checkout report not found", 404);
  }
  const url = await persistCheckoutPhoto(orgId, reportId, angle, dataUrl);
  const photo: VehiclePhoto = {
    angle,
    dataUrl: url,
    capturedAt: capturedAt || new Date().toISOString(),
    flaggedDamage: flags?.flaggedDamage || undefined,
    damageNote: cleanDamageNote(flags?.damageNote),
  };
  const photos = existing.photos.filter((p) => p.angle !== angle);
  photos.push(photo);
  const updated: CheckoutReport = {
    ...existing,
    photos,
    flagged:
      existing.flagged ||
      reportHasPhotoDamage({ photos }) ||
      inspectionFormFlagsReport(existing.inspectionForm),
  };
  const saved = mode === "postgres" ? await pgPutReport(orgId, updated) : await localPutReport(updated);
  if (flags?.flaggedDamage) {
    void recordCheckoutAlerts(orgId, saved).catch((err) => {
      console.error("[alerts] photo flag alerts failed:", err);
    });
  }
  return saved;
}

export async function addReportPhotos(
  orgId: string,
  reportId: string,
  incoming: Array<{
    angle: PhotoAngle;
    dataUrl: string;
    capturedAt?: string;
    flaggedDamage?: boolean;
    damageNote?: string;
  }>
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const existing =
    mode === "postgres" ? await pgGetReport(orgId, reportId) : await localGetReport(reportId);
  if (!existing) throw new SharedBackendError("Checkout report not found", 404);
  const stored = await Promise.all(
    incoming.map(async (item) => {
      const url = await persistCheckoutPhoto(orgId, reportId, item.angle, item.dataUrl);
      const photo: VehiclePhoto = {
        angle: item.angle,
        dataUrl: url,
        capturedAt: item.capturedAt || new Date().toISOString(),
        flaggedDamage: item.flaggedDamage || undefined,
        damageNote: cleanDamageNote(item.damageNote),
      };
      return photo;
    })
  );
  const photos = [...existing.photos];
  for (const photo of stored) {
    const idx = photos.findIndex((item) => item.angle === photo.angle);
    if (idx >= 0) photos[idx] = photo;
    else photos.push(photo);
  }
  const updated: CheckoutReport = {
    ...existing,
    photos,
    flagged:
      existing.flagged ||
      reportHasPhotoDamage({ photos }) ||
      inspectionFormFlagsReport(existing.inspectionForm),
  };
  const saved = mode === "postgres" ? await pgPutReport(orgId, updated) : await localPutReport(updated);
  if (stored.some((photo) => photo.flaggedDamage)) {
    void recordCheckoutAlerts(orgId, saved).catch((err) => {
      console.error("[alerts] photo flag alerts failed:", err);
    });
  }
  return saved;
}

export async function patchReportPhotoFlags(
  orgId: string,
  reportId: string,
  angle: PhotoAngle,
  flags: { flaggedDamage: boolean; damageNote?: string }
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const existing =
    mode === "postgres" ? await pgGetReport(orgId, reportId) : await localGetReport(reportId);
  if (!existing) {
    throw new SharedBackendError("Checkout report not found", 404);
  }
  const photo = existing.photos.find((p) => p.angle === angle);
  if (!photo) {
    throw new SharedBackendError("Photo not found", 404);
  }
  const wasFlagged = Boolean(photo.flaggedDamage);
  const photos = existing.photos.map((p) =>
    p.angle === angle
      ? {
          ...p,
          flaggedDamage: flags.flaggedDamage || undefined,
          damageNote: resolveDamageNote(
            flags.flaggedDamage,
            flags.damageNote,
            p.damageNote
          ),
        }
      : p
  );
  const updated: CheckoutReport = {
    ...existing,
    photos,
    flagged:
      existing.reviewStatus === "conditional" ||
      existing.reviewStatus === "fail" ||
      !!(existing.newDamageNotes && existing.newDamageNotes.trim()) ||
      reportHasPhotoDamage({ photos }) ||
      inspectionFormFlagsReport(existing.inspectionForm),
  };
  const saved = mode === "postgres" ? await pgPutReport(orgId, updated) : await localPutReport(updated);
  if (flags.flaggedDamage && !wasFlagged) {
    void recordCheckoutAlerts(orgId, saved).catch((err) => {
      console.error("[alerts] photo flag alerts failed:", err);
    });
  }
  return saved;
}

export async function setReportArchived(
  orgId: string,
  id: string,
  archived: boolean
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const report =
    mode === "postgres"
      ? await pgSetReportArchived(orgId, id, archived)
      : await localSetReportArchived(id, archived);
  if (!report) throw new SharedBackendError("Checkout report not found", 404);
  return report;
}

export async function deleteReport(orgId: string, id: string): Promise<void> {
  const mode = assertConfigured();
  const existing = mode === "postgres" ? await pgGetReport(orgId, id) : await localGetReport(id);
  if (!existing) throw new SharedBackendError("Checkout report not found", 404);
  await Promise.all(existing.photos.map((photo) => deleteStoredPhoto(photo.dataUrl)));
  const removed = mode === "postgres" ? await pgDeleteReport(orgId, id) : await localDeleteReport(id);
  if (!removed) throw new SharedBackendError("Checkout report not found", 404);
}

const USER_ROLES = ["super_admin", "management", "tech", "driver"] as const;

export async function listAppUsers(orgId: string): Promise<SharedAppUser[]> {
  const mode = assertConfigured();
  return mode === "postgres" ? pgListUsers(orgId) : localListUsers();
}

export async function createAppUser(orgId: string, input: {
  name: string;
  email: string;
  role: SharedAppUser["role"];
}): Promise<SharedAppUser> {
  const mode = assertConfigured();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name || !email) throw new SharedBackendError("Name and email are required", 400);
  if (!USER_ROLES.includes(input.role)) throw new SharedBackendError("Choose a role", 400);
  const existing = await listAppUsers(orgId);
  if (existing.some((user) => user.email.toLowerCase() === email)) {
    throw new SharedBackendError("A user with that email already exists", 409);
  }
  const user: SharedAppUser = {
    id: generateId(),
    name,
    email,
    role: input.role,
    active: true,
    createdAt: new Date().toISOString(),
  };
  return mode === "postgres" ? pgInsertUser(orgId, user) : localInsertUser(user);
}

export async function updateAppUser(
  orgId: string,
  id: string,
  patch: Partial<Pick<SharedAppUser, "name" | "email" | "role" | "active">>
): Promise<SharedAppUser> {
  const mode = assertConfigured();
  if (patch.role && !USER_ROLES.includes(patch.role)) {
    throw new SharedBackendError("Choose a role", 400);
  }
  const user = mode === "postgres" ? await pgUpdateUser(orgId, id, patch) : await localUpdateUser(id, patch);
  if (!user) throw new SharedBackendError("User not found", 404);
  return user;
}

export async function listOfficeAlerts(
  orgId: string,
  includeArchived = false
): Promise<SharedOfficeAlert[]> {
  const mode = assertConfigured();
  return mode === "postgres"
    ? pgListAlerts(orgId, includeArchived)
    : localListAlerts(includeArchived);
}

export async function setOfficeAlertArchived(
  orgId: string,
  id: string,
  archived: boolean
): Promise<SharedOfficeAlert> {
  const mode = assertConfigured();
  const alert =
    mode === "postgres"
      ? await pgSetAlertArchived(orgId, id, archived)
      : await localSetAlertArchived(id, archived);
  if (!alert) throw new SharedBackendError("Alert not found", 404);
  return alert;
}

export async function deleteOfficeAlert(orgId: string, id: string): Promise<void> {
  const mode = assertConfigured();
  const removed = mode === "postgres" ? await pgDeleteAlert(orgId, id) : await localDeleteAlert(id);
  if (!removed) throw new SharedBackendError("Alert not found", 404);
}

export async function reviewReport(
  orgId: string,
  reportId: string,
  input: CheckoutReviewInput
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const existing =
    mode === "postgres" ? await pgGetReport(orgId, reportId) : await localGetReport(reportId);
  if (!existing) {
    throw new SharedBackendError("Checkout report not found", 404);
  }
  const updated: CheckoutReport = {
    ...existing,
    reviewStatus: input.reviewStatus,
    reviewNotes: input.reviewNotes,
    newDamageNotes: input.newDamageNotes,
    retakeAngles:
      input.reviewStatus === "conditional" ? input.retakeAngles : undefined,
    reviewedAt: new Date().toISOString(),
    reviewedBy: input.reviewedBy,
    flagged:
      input.reviewStatus === "conditional" ||
      input.reviewStatus === "fail" ||
      !!(input.newDamageNotes && input.newDamageNotes.trim()) ||
      reportHasPhotoDamage(existing) ||
      inspectionFormFlagsReport(existing.inspectionForm),
  };
  if (mode === "postgres") return pgPutReport(orgId, updated);
  const saved = await localPatchReport(reportId, updated);
  if (!saved) throw new SharedBackendError("Checkout report not found", 404);
  return saved;
}

export function backendStatus() {
  return {
    mode: sharedBackendMode(),
    production: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
  };
}

async function readStoredCompanySettings(orgId: string) {
  const mode = assertConfigured();
  const raw =
    mode === "postgres"
      ? await pgReadCompanySettings(orgId)
      : await localReadCompanySettings();
  return parseCompanySettings(raw);
}

export async function getPublicCompanySettings(orgId: string): Promise<PublicCompanySettings> {
  return publicCompanySettings(await readStoredCompanySettings(orgId));
}

export async function saveCompanySettings(
  orgId: string,
  patch: CompanySettingsPatch
): Promise<PublicCompanySettings> {
  const mode = assertConfigured();
  const current = await readStoredCompanySettings(orgId);
  const next = mergeCompanySettings(current, patch);
  const json = next ? JSON.stringify(next) : null;
  if (mode === "postgres") await pgWriteCompanySettings(orgId, json);
  else await localWriteCompanySettings(next);
  return publicCompanySettings(next);
}

export async function getFleetSettings(orgId: string): Promise<FleetSettings> {
  const mode = assertConfigured();
  return mode === "postgres" ? pgGetFleetSettings(orgId) : localGetFleetSettings();
}

export async function updateFleetSettings(
  orgId: string,
  patch: Partial<FleetSettings>
): Promise<FleetSettings> {
  const mode = assertConfigured();
  const next =
    mode === "postgres"
      ? await pgSetFleetSettings(orgId, patch)
      : await localSetFleetSettings(patch);
  return next;
}
