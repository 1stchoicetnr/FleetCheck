import { CHECKOUT_PROBE_DRIVER, isCheckoutProbe } from "@/lib/checkout-probe";
import { errorResponse } from "@/lib/server/api-error";
import { deleteReport, getReport } from "@/lib/server/checkout-repo";
import { orgFromSession } from "@/lib/server/org-scope";
import {
  pgDeleteAlertsForActor,
  pgProbeCheckoutSnapshot,
  pgRecomputeVehicleMileage,
} from "@/lib/server/postgres-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADER = "x-checkout-probe";
const TOKEN = "probe-7f3a9c";

function allowed(req: Request): boolean {
  return req.headers.get(HEADER) === TOKEN;
}

function mapSnapshot(raw: Awaited<ReturnType<typeof pgProbeCheckoutSnapshot>>) {
  return {
    openReports: raw.openReports,
    pendingReports: raw.pendingReports,
    archivedReports: raw.archivedReports,
    openAlerts: raw.openAlerts,
    archivedAlerts: raw.archivedAlerts,
    mileageCleared: raw.mileageCleared,
    mileageFromLive: raw.mileageFromLive,
    openReportRows: raw.openReportRows.map((row) => ({
      id: String(row.id),
      unitNumber: String(row.unit_number ?? ""),
      companyId: String(row.company_id ?? ""),
      driverName: String(row.driver_name ?? ""),
      reviewStatus: String(row.review_status ?? ""),
      createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : "",
      vehicleId: String(row.vehicle_id ?? ""),
    })),
    openAlertRows: raw.openAlertRows.map((row) => ({
      id: String(row.id),
      reportId: row.report_id == null ? null : String(row.report_id),
      type: String(row.type ?? ""),
      actorName: String(row.actor_name ?? ""),
      createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : "",
    })),
    vehicles: raw.vehicles.map((row) => ({
      id: String(row.id),
      companyId: String(row.company_id ?? ""),
      unitNumber: String(row.unit_number ?? ""),
      lastMileage: row.last_mileage == null ? null : Number(row.last_mileage),
    })),
  };
}

/** Temporary count and cleanup gate for the one approved production checkout. */
export async function GET(req: Request) {
  if (!allowed(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const orgId = orgFromSession();
    const reportId = new URL(req.url).searchParams.get("report");
    if (reportId) {
      const report = await getReport(orgId, reportId);
      if (!report || !isCheckoutProbe(report)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(
        { report },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const snapshot = mapSnapshot(await pgProbeCheckoutSnapshot(orgId));
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Failed to read the checkout probe");
  }
}

export async function DELETE(req: Request) {
  if (!allowed(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const orgId = orgFromSession();
    const body = (await req.json()) as { id?: string };
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "Missing report id" }, { status: 400 });
    }
    const existing = await getReport(orgId, id);
    if (existing && !isCheckoutProbe(existing)) {
      return NextResponse.json(
        { error: "That report is not the test checkout." },
        { status: 409 }
      );
    }
    let deletedReport = false;
    if (existing) {
      await deleteReport(orgId, id);
      deletedReport = true;
      await pgRecomputeVehicleMileage(orgId, existing.vehicleId);
    }
    const deletedAlerts = await pgDeleteAlertsForActor(orgId, id, CHECKOUT_PROBE_DRIVER);
    const snapshot = mapSnapshot(await pgProbeCheckoutSnapshot(orgId));
    return NextResponse.json({
      deletedReport,
      deletedAlerts,
      vehicleId: existing?.vehicleId ?? null,
      ...snapshot,
    });
  } catch (err) {
    return errorResponse(err, "Failed to delete the test checkout");
  }
}
