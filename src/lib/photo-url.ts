import type { CheckoutReport, VehiclePhoto } from "./types";

/** Browser-facing photo address. The stored blob URL stays on the server. */
export function clientPhotoSrc(reportId: string, angle: string, stored: string | undefined): string {
  if (!stored) return "";
  if (stored.startsWith("/photo-examples/")) return stored;
  if (stored.startsWith("/api/checkout-reports/")) return stored;
  return `/api/checkout-reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(angle)}`;
}

/** Replace stored photo addresses before a report is sent to the browser. */
export function toClientReport<T extends Pick<CheckoutReport, "id" | "photos">>(report: T): T {
  return {
    ...report,
    photos: report.photos.map((photo) => ({
      ...photo,
      dataUrl: clientPhotoSrc(report.id, photo.angle, photo.dataUrl),
    })),
  };
}

export function sameDriverName(left?: string | null, right?: string | null): boolean {
  const a = (left || "").trim().toLowerCase();
  const b = (right || "").trim().toLowerCase();
  return a.length > 0 && a === b;
}

/**
 * Who may load a checkout photo.
 * Office, Manager, and Owner may, inside their fleets.
 * The driver named on the check may.
 * Another signed-in driver may only when they are allowed to check that unit,
 * so the next driver can still see the previous photos.
 */
export function photoViewKind(
  role: string | null | undefined,
  viewerName: string | null | undefined,
  driverName: string | null | undefined
): "office" | "submitter" | "next-driver" | "deny" {
  if (role === "office" || role === "manager" || role === "owner") return "office";
  if (role === "driver") {
    return sameDriverName(viewerName, driverName) ? "submitter" : "next-driver";
  }
  return "deny";
}

/** Remote photo bytes the server may fetch. Anything else stays unread. */
export function storedPhotoFetchTarget(stored: string, requestUrl: string): string | null {
  if (stored.startsWith("/photo-examples/") || stored.startsWith("/api/shared-files/")) {
    if (stored.includes("..") || stored.includes("\\") || stored.includes("://")) return null;
    return new URL(stored, requestUrl).toString();
  }
  let url: URL;
  try {
    url = new URL(stored);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host !== "blob.vercel-storage.com" && !host.endsWith(".blob.vercel-storage.com")) {
    return null;
  }
  return url.toString();
}

export function priorReportForClient(report: CheckoutReport): CheckoutReport {
  const next = toClientReport(report);
  delete next.signatureDataUrl;
  return next;
}

export type ClientVehiclePhoto = VehiclePhoto;
