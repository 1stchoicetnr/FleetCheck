import type { CheckoutInspectionForm, Powertrain } from "./inspection-form";
import {
  AlertEventType,
  CheckoutReport,
  CheckoutReviewStatus,
  CheckoutType,
  Company,
  PhotoAngle,
  VehicleKnownIssue,
} from "./types";
import type { FleetSettings } from "./fleet-settings";

export interface SharedFleet {
  id: string;
  name: string;
  type: string;
  companyId: string;
  archivedAt?: string;
  createdAt: string;
}

export interface SharedVehicle {
  id: string;
  companyId: string;
  fleetId?: string;
  unitNumber: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  lastMileage?: number;
  archivedAt?: string;
  powertrain?: Powertrain;
  lastOilChangeMileage?: number;
  knownIssue?: VehicleKnownIssue;
  createdAt: string;
}

function officePinHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const pin = sessionStorage.getItem("fleetcheck-office-pin") || "";
  return pin ? { "x-office-pin": pin } : {};
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...officePinHeader(),
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export async function fetchSharedStatus() {
  return api<{ mode: string; production: boolean }>("/api/shared-health");
}

export async function fetchCompanies(): Promise<Company[]> {
  const data = await api<{ companies: Company[] }>("/api/companies");
  return data.companies;
}

export async function fetchFleets(options?: {
  includeArchived?: boolean;
}): Promise<SharedFleet[]> {
  const params = new URLSearchParams();
  if (options?.includeArchived) params.set("includeArchived", "1");
  const qs = params.toString();
  const data = await api<{ fleets: SharedFleet[] }>(`/api/fleets${qs ? `?${qs}` : ""}`);
  return data.fleets;
}

export async function createFleet(input: {
  name: string;
  type: string;
  companyId: string;
}): Promise<SharedFleet> {
  const data = await api<{ fleet: SharedFleet }>("/api/fleets", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.fleet;
}

export async function updateFleet(
  id: string,
  patch: { name?: string; archived?: boolean }
): Promise<SharedFleet> {
  const data = await api<{ fleet: SharedFleet }>(`/api/fleets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.fleet;
}

export async function deleteFleet(id: string): Promise<void> {
  await api(`/api/fleets/${id}`, { method: "DELETE" });
}

export async function fetchVehicles(
  companyId?: string,
  options?: { includeArchived?: boolean }
): Promise<SharedVehicle[]> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (options?.includeArchived) params.set("includeArchived", "1");
  const qs = params.toString();
  const data = await api<{ vehicles: SharedVehicle[] }>(
    `/api/vehicles${qs ? `?${qs}` : ""}`
  );
  return data.vehicles;
}

export async function setVehicleArchived(
  id: string,
  archived: boolean,
  officePin: string
): Promise<SharedVehicle> {
  const data = await api<{ vehicle: SharedVehicle }>(`/api/vehicles/${id}`, {
    method: "PATCH",
    headers: { "x-office-pin": officePin },
    body: JSON.stringify({ archived }),
  });
  return data.vehicle;
}

export async function setVehiclePowertrain(
  id: string,
  powertrain: Powertrain,
  officePin: string
): Promise<SharedVehicle> {
  const data = await api<{ vehicle: SharedVehicle }>(`/api/vehicles/${id}`, {
    method: "PATCH",
    headers: { "x-office-pin": officePin },
    body: JSON.stringify({ powertrain }),
  });
  return data.vehicle;
}

export async function upsertSharedVehicle(input: {
  companyId: string;
  fleetId?: string;
  unitNumber?: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  powertrain?: Powertrain;
}): Promise<SharedVehicle> {
  const data = await api<{ vehicle: SharedVehicle }>("/api/vehicles", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.vehicle;
}

export async function fetchCheckoutReports(options?: {
  includeArchived?: boolean;
  companyId?: string;
  vehicleId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  reports: CheckoutReport[];
  total: number;
  flagged: number;
  stuck?: number;
  limit: number;
  offset: number;
}> {
  const params = new URLSearchParams();
  if (options?.includeArchived) params.set("includeArchived", "1");
  if (options?.companyId) params.set("companyId", options.companyId);
  if (options?.vehicleId) params.set("vehicleId", options.vehicleId);
  if (options?.status) params.set("status", options.status);
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset != null) params.set("offset", String(options.offset));
  const qs = params.toString();
  return api(`/api/checkout-reports${qs ? `?${qs}` : ""}`);
}

export async function updateSharedVehicleService(
  id: string,
  patch: {
    knownIssue?: VehicleKnownIssue | null;
    lastOilChangeMileage?: number | null;
  }
): Promise<SharedVehicle> {
  const data = await api<{ vehicle: SharedVehicle }>(`/api/vehicles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.vehicle;
}

export async function setCheckoutReportArchived(
  id: string,
  archived: boolean
): Promise<CheckoutReport> {
  const data = await api<{ report: CheckoutReport }>(`/api/checkout-reports/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
  return data.report;
}

export async function deleteCheckoutReport(id: string): Promise<void> {
  await api(`/api/checkout-reports/${id}`, { method: "DELETE" });
}

export interface OfficeAlert {
  id: string;
  type: AlertEventType;
  message: string;
  vehicleId: string;
  vehiclePlate: string;
  actorName: string;
  reportId?: string;
  createdAt: string;
  read: boolean;
  archivedAt?: string;
}

export async function fetchOfficeAlerts(options?: {
  includeArchived?: boolean;
}): Promise<OfficeAlert[]> {
  const query = options?.includeArchived ? "?includeArchived=1" : "";
  const data = await api<{ alerts: OfficeAlert[] }>(`/api/alerts${query}`);
  return data.alerts;
}

export async function setOfficeAlertArchived(
  id: string,
  archived: boolean
): Promise<OfficeAlert> {
  const data = await api<{ alert: OfficeAlert }>(`/api/alerts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
  return data.alert;
}

export async function deleteOfficeAlert(id: string): Promise<void> {
  await api(`/api/alerts/${id}`, { method: "DELETE" });
}

export async function fetchCompanySettings(): Promise<import("./company-settings").PublicCompanySettings> {
  const data = await api<{ settings: import("./company-settings").PublicCompanySettings }>(
    "/api/company-settings"
  );
  return data.settings;
}

export async function saveCompanySettings(
  patch: import("./company-settings").CompanySettingsPatch
): Promise<import("./company-settings").PublicCompanySettings> {
  const data = await api<{ settings: import("./company-settings").PublicCompanySettings }>(
    "/api/company-settings",
    { method: "PATCH", body: JSON.stringify(patch) }
  );
  return data.settings;
}

export async function fetchMyChecks(): Promise<CheckoutReport[]> {
  const data = await api<{ reports: CheckoutReport[] }>("/api/my-checks");
  return data.reports;
}

export async function markCheckoutSent(reportId: string): Promise<CheckoutReport> {
  const data = await api<{ report: CheckoutReport }>(
    `/api/checkout-reports/${reportId}/sent`,
    { method: "POST", body: "{}" }
  );
  return data.report;
}

export async function fetchCheckoutReport(
  id: string
): Promise<CheckoutReport | null> {
  const data = await api<{ report: CheckoutReport | null }>(
    `/api/checkout-reports/${id}`
  );
  return data.report;
}

export async function fetchPriorReports(
  vehicleId: string,
  currentId?: string
): Promise<CheckoutReport[]> {
  const params = new URLSearchParams({ vehicleId });
  if (currentId) params.set("currentId", currentId);
  const data = await api<{ reports: CheckoutReport[] }>(
    `/api/checkout-reports/priors?${params.toString()}`
  );
  return data.reports;
}

export async function createCheckoutReport(input: {
  companyId: string;
  vehicleId: string;
  unitNumber: string;
  plate?: string;
  year: number;
  make: string;
  model: string;
  odometer: number;
  driverName: string;
  dispatcherName: string;
  type: CheckoutType;
  inspectionForm?: CheckoutInspectionForm;
  signatureDataUrl?: string;
  signedAt?: string;
  idempotencyKey?: string;
}): Promise<CheckoutReport> {
  const data = await api<{ report: CheckoutReport }>("/api/checkout-reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.report;
}

export async function uploadCheckoutPhotos(
  reportId: string,
  photos: Array<{
    angle: PhotoAngle;
    dataUrl: string;
    capturedAt?: string;
    flaggedDamage?: boolean;
    damageNote?: string;
  }>
): Promise<CheckoutReport> {
  const data = await api<{ report: CheckoutReport }>(
    `/api/checkout-reports/${reportId}/photos`,
    {
      method: "POST",
      body: JSON.stringify({ photos }),
    }
  );
  return data.report;
}

export async function uploadCheckoutPhoto(
  reportId: string,
  angle: PhotoAngle,
  dataUrl: string,
  capturedAt?: string,
  flags?: { flaggedDamage?: boolean; damageNote?: string }
): Promise<CheckoutReport> {
  const data = await api<{ report: CheckoutReport }>(
    `/api/checkout-reports/${reportId}/photos`,
    {
      method: "POST",
      body: JSON.stringify({
        angle,
        dataUrl,
        capturedAt,
        flaggedDamage: flags?.flaggedDamage,
        damageNote: flags?.damageNote,
      }),
    }
  );
  return data.report;
}

export async function flagCheckoutPhoto(
  reportId: string,
  angle: PhotoAngle,
  flaggedDamage: boolean,
  officePin: string,
  damageNote?: string
): Promise<CheckoutReport> {
  const data = await api<{ report: CheckoutReport }>(
    `/api/checkout-reports/${reportId}/photos/${angle}`,
    {
      method: "PATCH",
      headers: { "x-office-pin": officePin },
      body: JSON.stringify({ flaggedDamage, damageNote }),
    }
  );
  return data.report;
}

export async function reviewCheckoutReport(
  reportId: string,
  input: {
    reviewStatus: CheckoutReviewStatus;
    reviewNotes?: string;
    newDamageNotes?: string;
    retakeAngles?: PhotoAngle[];
    reviewedBy: string;
  },
  officePin: string
): Promise<CheckoutReport> {
  const data = await api<{ report: CheckoutReport }>(
    `/api/checkout-reports/${reportId}`,
    {
      method: "PATCH",
      headers: { "x-office-pin": officePin },
      body: JSON.stringify(input),
    }
  );
  return data.report;
}

export async function verifyOfficePinRemote(
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await api("/api/office-pin", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Incorrect PIN. Try again.",
    };
  }
}

export interface AppUserRecord {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "management" | "tech" | "driver";
  active: boolean;
  createdAt: string;
}

export async function fetchAppFeedback(): Promise<
  import("@/lib/feedback").StoredFeedback[]
> {
  const data = await api<{ feedback?: import("@/lib/feedback").StoredFeedback[] }>(
    "/api/feedback"
  );
  return data.feedback ?? [];
}

export async function fetchAppUsers(): Promise<AppUserRecord[]> {
  const data = await api<{ users: AppUserRecord[] }>("/api/users");
  return data.users;
}

export async function createAppUser(input: {
  name: string;
  email: string;
  role: AppUserRecord["role"];
}): Promise<AppUserRecord> {
  const data = await api<{ user: AppUserRecord }>("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.user;
}

export async function updateAppUser(
  id: string,
  patch: Partial<Pick<AppUserRecord, "name" | "email" | "role" | "active">>
): Promise<AppUserRecord> {
  const data = await api<{ user: AppUserRecord }>(`/api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.user;
}

export async function fetchFleetSettings(): Promise<FleetSettings> {
  const data = await api<{ settings: FleetSettings }>("/api/fleet-settings");
  return data.settings;
}

export async function updateFleetSettings(input: {
  allowDriverAddVehicles: boolean;
}): Promise<FleetSettings> {
  const data = await api<{ settings: FleetSettings }>("/api/fleet-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data.settings;
}
