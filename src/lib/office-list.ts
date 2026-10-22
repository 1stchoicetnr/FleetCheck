import { inspectionFormFlagsReport } from "./inspection-form.ts";
import { cleanDamageNote } from "./photo-flags.ts";
import type { CheckoutReport, CheckoutReviewStatus } from "./types.ts";

export function isOfficeReportFlagged(report: CheckoutReport): boolean {
  return (
    report.flagged ||
    report.reviewStatus === "conditional" ||
    report.reviewStatus === "fail" ||
    !!(report.newDamageNotes && report.newDamageNotes.trim()) ||
    inspectionFormFlagsReport(report.inspectionForm)
  );
}

export const OFFICE_REPORT_PAGE_SIZE = 20;

export type OfficeListStatus = "all" | "flagged" | "archived" | CheckoutReviewStatus;

export interface OfficeListQuery {
  includeArchived?: boolean;
  companyId?: string;
  vehicleId?: string;
  status?: OfficeListStatus;
  limit?: number;
  offset?: number;
  /** When set, only these units. An empty list matches nothing. */
  vehicleIds?: string[] | null;
}

export interface OfficeListPage {
  reports: CheckoutReport[];
  total: number;
  flagged: number;
  limit: number;
  offset: number;
}

export function officeReportPage(query: { limit?: number; offset?: number }): {
  limit: number;
  offset: number;
} {
  const limit = Number.isFinite(query.limit) ? Math.trunc(query.limit as number) : OFFICE_REPORT_PAGE_SIZE;
  const offset = Number.isFinite(query.offset) ? Math.trunc(query.offset as number) : 0;
  return {
    limit: Math.min(50, Math.max(1, limit)),
    offset: Math.max(0, offset),
  };
}

/** List rows keep damage flags and notes, not photo bytes or the signature. */
export function toOfficeListReport(report: CheckoutReport): CheckoutReport {
  const next: CheckoutReport = {
    ...report,
    photos: report.photos.map((photo) => ({
      angle: photo.angle,
      capturedAt: photo.capturedAt,
      flaggedDamage: photo.flaggedDamage || undefined,
      damageNote: cleanDamageNote(photo.damageNote),
      dataUrl: "",
    })),
  };
  delete next.signatureDataUrl;
  return next;
}

export function pageOfficeReports(
  reports: CheckoutReport[],
  query: OfficeListQuery
): OfficeListPage {
  const { limit, offset } = officeReportPage(query);
  const archivedOnly = query.status === "archived";
  const scoped = reports
    .filter((report) => {
      if (archivedOnly) {
        if (!report.archivedAt) return false;
      } else if (!query.includeArchived && report.archivedAt) {
        return false;
      }
      if (query.companyId && report.companyId !== query.companyId) return false;
      if (query.vehicleId && report.vehicleId !== query.vehicleId) return false;
      if (query.vehicleIds && !query.vehicleIds.includes(report.vehicleId)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
  const flagged = scoped.filter(isOfficeReportFlagged).length;
  const status =
    query.status && query.status !== "all" && query.status !== "archived"
      ? query.status
      : null;
  const matched = status
    ? scoped.filter((report) =>
        status === "flagged"
          ? isOfficeReportFlagged(report)
          : report.reviewStatus === status
      )
    : scoped;
  return {
    reports: matched.slice(offset, offset + limit).map(toOfficeListReport),
    total: matched.length,
    flagged,
    limit,
    offset,
  };
}
