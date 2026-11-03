import { errorResponse } from "@/lib/server/api-error";
import { getReport, listOfficeAlerts } from "@/lib/server/checkout-repo";
import { alertDamageDetails } from "@/lib/alert-details";
import { clientPhotoSrc } from "@/lib/photo-url";
import { vehicleIdsInScope } from "@/lib/server/fleet-scope";
import { assertOfficeAccess, canViewArchivedRecords } from "@/lib/server/request-auth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await assertOfficeAccess(req);
    const includeArchived =
      canViewArchivedRecords(auth) &&
      req.nextUrl.searchParams.get("includeArchived") === "1";
    const allowed = await vehicleIdsInScope(auth);
    const alerts = (await listOfficeAlerts(auth.orgId, includeArchived)).filter((alert) =>
      allowed ? allowed.includes(alert.vehicleId) : true
    );
    const ids = [...new Set(alerts.map((alert) => alert.reportId).filter(Boolean) as string[])];
    const reports = new Map(
      await Promise.all(
        ids.map(async (id) => [id, await getReport(auth.orgId, id).catch(() => undefined)] as const)
      )
    );
    const withDetails = alerts.map((alert) => {
      const report = alert.reportId ? reports.get(alert.reportId) : undefined;
      if (!report) return alert;
      const details = alertDamageDetails(report);
      return {
        ...alert,
        details: {
          ...details,
          photos: details.photos.map((photo) => ({
            ...photo,
            src: clientPhotoSrc(
              report.id,
              photo.angle,
              report.photos.find((p) => p.angle === photo.angle)?.dataUrl
            ),
          })),
        },
      };
    });
    return NextResponse.json(
      { alerts: withDetails },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load alerts");
  }
}
