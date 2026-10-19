import { generateId, normalizePlate } from "@/lib/utils";
import {
  CheckoutReport,
  Company,
  PhotoAngle,
  VehiclePhoto,
} from "@/lib/types";
import {
  inferPowertrain,
  inspectionFormFlagsReport,
  Powertrain,
  validateInspectionForm,
} from "@/lib/inspection-form";
import { earlierReports } from "@/lib/report-priors";
import { reportHasPhotoDamage } from "@/lib/photo-flags";
import {
  VEHICLE_ARCHIVED_MESSAGE,
  isVehicleArchived,
} from "@/lib/vehicle-archive";
import {
  localFindVehicleByPlate,
  localGetReport,
  localGetVehicle,
  localListCompanies,
  localDeleteReport,
  localListAlerts,
  localDeleteAlert,
  localListReports,
  localListVehicles,
  localPatchReport,
  localPutReport,
  localSetAlertArchived,
  localSetReportArchived,
  localSetVehicleArchived,
  localSetVehiclePowertrain,
  localUpsertVehicle,
  localGetFleetSettings,
  localSetFleetSettings,
} from "./local-store";
import { deleteStoredPhoto, persistCheckoutPhoto } from "./photo-store";
import { recordCheckoutAlerts } from "./report-alerts";
import { notifyCheckoutReport } from "./slack-notify";
import {
  pgFindVehicleByPlate,
  pgGetReport,
  pgGetVehicle,
  pgListCompanies,
  pgDeleteAlert,
  pgDeleteReport,
  pgListAlerts,
  pgListReports,
  pgListVehicles,
  pgPutReport,
  pgSetAlertArchived,
  pgSetReportArchived,
  pgSetVehicleArchived,
  pgSetVehiclePowertrain,
  pgUpsertVehicle,
  pgGetFleetSettings,
  pgSetFleetSettings,
} from "./postgres-store";
import { sharedBackendMode } from "./shared-config";
import {
  CheckoutReportInput,
  CheckoutReviewInput,
  ListVehiclesOptions,
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

export async function listCompanies(): Promise<Company[]> {
  const mode = assertConfigured();
  const companies =
    mode === "postgres" ? await pgListCompanies() : await localListCompanies();
  return companies.sort((a, b) => {
    if (a.slug === "rad-cab") return -1;
    if (b.slug === "rad-cab") return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function listVehicles(
  companyId?: string,
  options?: ListVehiclesOptions
): Promise<SharedVehicle[]> {
  const mode = assertConfigured();
  const vehicles =
    mode === "postgres"
      ? await pgListVehicles(companyId, options)
      : await localListVehicles(companyId, options);
  return [...vehicles].sort((a, b) =>
    a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
  );
}

export async function getVehicle(id: string): Promise<SharedVehicle | undefined> {
  const mode = assertConfigured();
  return mode === "postgres" ? pgGetVehicle(id) : localGetVehicle(id);
}

export async function findVehicleByPlate(
  companyId: string,
  plate: string
): Promise<SharedVehicle | undefined> {
  const mode = assertConfigured();
  return mode === "postgres"
    ? pgFindVehicleByPlate(companyId, plate)
    : localFindVehicleByPlate(companyId, plate);
}

export async function upsertVehicle(
  input: UpsertVehicleInput
): Promise<SharedVehicle> {
  const mode = assertConfigured();
  if (!input.companyId || !input.plate.trim() || !input.make.trim() || !input.model.trim()) {
    throw new SharedBackendError("Plate, make, and model are required", 400);
  }
  if (Number.isNaN(Number(input.year))) {
    throw new SharedBackendError("Year must be a number", 400);
  }
  if (input.powertrain && input.powertrain !== "ev" && input.powertrain !== "gas") {
    throw new SharedBackendError("Powertrain must be gas or ev", 400);
  }
  const existing = await findVehicleByPlate(input.companyId, input.plate);
  if (existing && isVehicleArchived(existing)) {
    throw new SharedBackendError(VEHICLE_ARCHIVED_MESSAGE, 409);
  }
  return mode === "postgres" ? pgUpsertVehicle(input) : localUpsertVehicle(input);
}

export async function setVehicleArchived(
  id: string,
  archived: boolean
): Promise<SharedVehicle> {
  const mode = assertConfigured();
  const vehicle =
    mode === "postgres"
      ? await pgSetVehicleArchived(id, archived)
      : await localSetVehicleArchived(id, archived);
  if (!vehicle) {
    throw new SharedBackendError("Unit not found", 404);
  }
  return vehicle;
}

export async function setVehiclePowertrain(
  id: string,
  powertrain: Powertrain
): Promise<SharedVehicle> {
  const mode = assertConfigured();
  if (powertrain !== "ev" && powertrain !== "gas") {
    throw new SharedBackendError("Powertrain must be gas or ev", 400);
  }
  const vehicle =
    mode === "postgres"
      ? await pgSetVehiclePowertrain(id, powertrain)
      : await localSetVehiclePowertrain(id, powertrain);
  if (!vehicle) {
    throw new SharedBackendError("Unit not found", 404);
  }
  return vehicle;
}

export async function listReports(options?: {
  includeArchived?: boolean;
}): Promise<CheckoutReport[]> {
  const mode = assertConfigured();
  const reports = mode === "postgres" ? await pgListReports() : await localListReports();
  if (options?.includeArchived) return reports;
  return reports.filter((report) => !report.archivedAt);
}

export async function getReport(id: string): Promise<CheckoutReport | undefined> {
  const mode = assertConfigured();
  return mode === "postgres" ? pgGetReport(id) : localGetReport(id);
}

export async function getPriorReports(
  vehicleId: string,
  currentId?: string,
  limit = 2
): Promise<CheckoutReport[]> {
  const reports = (await listReports()).filter((report) => report.vehicleId === vehicleId);
  if (!currentId) return reports.slice(0, limit);
  const current =
    reports.find((report) => report.id === currentId) ?? (await getReport(currentId));
  if (!current) return reports.slice(0, limit);
  return earlierReports(
    reports.filter((report) => report.vehicleId === current.vehicleId),
    current,
    limit
  );
}

export async function createReport(
  input: CheckoutReportInput
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const now = new Date().toISOString();
  let vehicle =
    (await getVehicle(input.vehicleId)) ||
    (input.plate
      ? await findVehicleByPlate(input.companyId, input.plate)
      : undefined);
  if (!input.signatureDataUrl?.trim()) {
    throw new SharedBackendError("Driver signature is required", 400);
  }
  const powertrain = inferPowertrain(
    input.make,
    input.model,
    vehicle?.powertrain
  );
  const inspection = validateInspectionForm(input.inspectionForm, powertrain);
  if (!inspection.ok) {
    throw new SharedBackendError(inspection.error, 400);
  }
  if (vehicle && isVehicleArchived(vehicle)) {
    throw new SharedBackendError(VEHICLE_ARCHIVED_MESSAGE, 409);
  }
  if (!vehicle) {
    vehicle = await upsertVehicle({
      companyId: input.companyId,
      unitNumber: input.unitNumber,
      plate: input.plate || input.unitNumber,
      make: input.make,
      model: input.model,
      year: input.year,
    });
  }
  const plate = normalizePlate(input.plate || vehicle.plate || input.unitNumber);
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
  };
  const saved =
    mode === "postgres" ? await pgPutReport(report) : await localPutReport(report);
  void notifyCheckoutReport(saved);
  void recordCheckoutAlerts(saved).catch((err) => {
    console.error("[alerts] checkout report alerts failed:", err);
  });
  return saved;
}

export async function addReportPhoto(
  reportId: string,
  angle: PhotoAngle,
  dataUrl: string,
  capturedAt?: string,
  flags?: { flaggedDamage?: boolean; damageNote?: string }
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const existing =
    mode === "postgres" ? await pgGetReport(reportId) : await localGetReport(reportId);
  if (!existing) {
    throw new SharedBackendError("Checkout report not found", 404);
  }
  const url = await persistCheckoutPhoto(reportId, angle, dataUrl);
  const photo: VehiclePhoto = {
    angle,
    dataUrl: url,
    capturedAt: capturedAt || new Date().toISOString(),
    flaggedDamage: flags?.flaggedDamage || undefined,
    damageNote: flags?.damageNote?.trim() || undefined,
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
  const saved = mode === "postgres" ? await pgPutReport(updated) : await localPutReport(updated);
  if (flags?.flaggedDamage) {
    void recordCheckoutAlerts(saved).catch((err) => {
      console.error("[alerts] photo flag alerts failed:", err);
    });
  }
  return saved;
}

export async function patchReportPhotoFlags(
  reportId: string,
  angle: PhotoAngle,
  flags: { flaggedDamage: boolean; damageNote?: string }
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const existing =
    mode === "postgres" ? await pgGetReport(reportId) : await localGetReport(reportId);
  if (!existing) {
    throw new SharedBackendError("Checkout report not found", 404);
  }
  const photo = existing.photos.find((p) => p.angle === angle);
  if (!photo) {
    throw new SharedBackendError("Photo not found", 404);
  }
  const photos = existing.photos.map((p) =>
    p.angle === angle
      ? {
          ...p,
          flaggedDamage: flags.flaggedDamage || undefined,
          damageNote: flags.flaggedDamage
            ? flags.damageNote?.trim() || p.damageNote
            : undefined,
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
  const saved = mode === "postgres" ? await pgPutReport(updated) : await localPutReport(updated);
  if (flags.flaggedDamage) {
    void recordCheckoutAlerts(saved).catch((err) => {
      console.error("[alerts] photo flag alerts failed:", err);
    });
  }
  return saved;
}

export async function setReportArchived(
  id: string,
  archived: boolean
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const report =
    mode === "postgres"
      ? await pgSetReportArchived(id, archived)
      : await localSetReportArchived(id, archived);
  if (!report) throw new SharedBackendError("Checkout report not found", 404);
  return report;
}

export async function deleteReport(id: string): Promise<void> {
  const mode = assertConfigured();
  const existing = mode === "postgres" ? await pgGetReport(id) : await localGetReport(id);
  if (!existing) throw new SharedBackendError("Checkout report not found", 404);
  await Promise.all(existing.photos.map((photo) => deleteStoredPhoto(photo.dataUrl)));
  const removed = mode === "postgres" ? await pgDeleteReport(id) : await localDeleteReport(id);
  if (!removed) throw new SharedBackendError("Checkout report not found", 404);
}

export async function listOfficeAlerts(includeArchived = false): Promise<SharedOfficeAlert[]> {
  const mode = assertConfigured();
  return mode === "postgres"
    ? pgListAlerts(includeArchived)
    : localListAlerts(includeArchived);
}

export async function setOfficeAlertArchived(
  id: string,
  archived: boolean
): Promise<SharedOfficeAlert> {
  const mode = assertConfigured();
  const alert =
    mode === "postgres"
      ? await pgSetAlertArchived(id, archived)
      : await localSetAlertArchived(id, archived);
  if (!alert) throw new SharedBackendError("Alert not found", 404);
  return alert;
}

export async function deleteOfficeAlert(id: string): Promise<void> {
  const mode = assertConfigured();
  const removed = mode === "postgres" ? await pgDeleteAlert(id) : await localDeleteAlert(id);
  if (!removed) throw new SharedBackendError("Alert not found", 404);
}

export async function reviewReport(
  reportId: string,
  input: CheckoutReviewInput
): Promise<CheckoutReport> {
  const mode = assertConfigured();
  const existing =
    mode === "postgres" ? await pgGetReport(reportId) : await localGetReport(reportId);
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
  if (mode === "postgres") return pgPutReport(updated);
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

export async function getFleetSettings(): Promise<FleetSettings> {
  const mode = assertConfigured();
  return mode === "postgres" ? pgGetFleetSettings() : localGetFleetSettings();
}

export async function updateFleetSettings(
  patch: Partial<FleetSettings>
): Promise<FleetSettings> {
  const mode = assertConfigured();
  const next =
    mode === "postgres"
      ? await pgSetFleetSettings(patch)
      : await localSetFleetSettings(patch);
  return next;
}
