import {
  CheckoutReport,
  CheckoutReviewStatus,
  CheckoutType,
  Company,
  PhotoAngle,
} from "./types";

export interface SharedVehicle {
  id: string;
  companyId: string;
  unitNumber: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  lastMileage?: number;
  archivedAt?: string;
  createdAt: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
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

export async function upsertSharedVehicle(input: {
  companyId: string;
  unitNumber?: string;
  plate: string;
  make: string;
  model: string;
  year: number;
}): Promise<SharedVehicle> {
  const data = await api<{ vehicle: SharedVehicle }>("/api/vehicles", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.vehicle;
}

export async function fetchCheckoutReports(): Promise<CheckoutReport[]> {
  const data = await api<{ reports: CheckoutReport[] }>("/api/checkout-reports");
  return data.reports;
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
  signatureDataUrl?: string;
  signedAt?: string;
}): Promise<CheckoutReport> {
  const data = await api<{ report: CheckoutReport }>("/api/checkout-reports", {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export async function verifyOfficePinRemote(pin: string): Promise<boolean> {
  try {
    await api("/api/office-pin", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
    return true;
  } catch {
    return false;
  }
}
