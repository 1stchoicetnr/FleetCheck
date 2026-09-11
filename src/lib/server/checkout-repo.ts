import { generateId, normalizePlate } from "@/lib/utils";
import {
  CheckoutReport,
  Company,
  PhotoAngle,
  VehiclePhoto,
} from "@/lib/types";
import {
  VEHICLE_ARCHIVED_MESSAGE,
  isVehicleArchived,
} from "@/lib/vehicle-archive";
import {
  localFindVehicleByPlate,
  localGetReport,
  localGetVehicle,
  localListCompanies,
  localListReports,
  localListVehicles,
  localPatchReport,
  localPutReport,
  localSetVehicleArchived,
  localUpsertVehicle,
} from "./local-store";
import { persistCheckoutPhoto } from "./photo-store";
import { notifyCheckoutReport } from "./slack-notify";
import {
  pgFindVehicleByPlate,
  pgGetReport,
  pgGetVehicle,
  pgListCompanies,
  pgListReports,
  pgListVehicles,
  pgPutReport,
  pgSetVehicleArchived,
  pgUpsertVehicle,
} from "./postgres-store";
import { sharedBackendMode } from "./shared-config";
import {
  CheckoutReportInput,
  CheckoutReviewInput,
  ListVehiclesOptions,
  SharedVehicle,
  UpsertVehicleInput,
} from "./shared-types";

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

export async function listReports(): Promise<CheckoutReport[]> {
  const mode = assertConfigured();
  return mode === "postgres" ? pgListReports() : localListReports();
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
  const reports = await listReports();
  return reports
    .filter((r) => r.vehicleId === vehicleId && r.id !== currentId)
    .slice(0, limit);
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
    photos: [],
    status: "complete",
    completedAt: now,
    reviewStatus: "pending",
    flagged: false,
    synced: true,
    createdAt: now,
  };
  const saved =
    mode === "postgres" ? await pgPutReport(report) : await localPutReport(report);
  void notifyCheckoutReport(saved);
  return saved;
}

export async function addReportPhoto(
  reportId: string,
  angle: PhotoAngle,
  dataUrl: string,
  capturedAt?: string
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
  };
  const photos = existing.photos.filter((p) => p.angle !== angle);
  photos.push(photo);
  const updated = { ...existing, photos };
  return mode === "postgres" ? pgPutReport(updated) : localPutReport(updated);
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
      !!(input.newDamageNotes && input.newDamageNotes.trim()),
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
