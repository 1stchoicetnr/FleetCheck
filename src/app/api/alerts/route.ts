import { errorResponse } from "@/lib/server/api-error";
import { getReport, listOfficeAlerts, listVehicleReports } from "@/lib/server/checkout-repo";
import { beforeAfterPairs, pairsForClient } from "@/lib/damage-before-after";
import { whoHadItLast } from "@/lib/repair-report";
import type { CheckoutReport } from "@/lib/types";
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
    // Before / after photos: one history read per unit with an open damage alert.
    const histories = new Map<string, Promise<CheckoutReport[]>>();
    const historyFor = (vehicleId: string) => {
      if (!histories.has(vehicleId)) {
        histories.set(vehicleId, listVehicleReports(auth.orgId, vehicleId).catch(() => []));
      }
      return histories.get(vehicleId)!;
    };
    const withDetails = await Promise.all(alerts.map(async (alert) => {
      const report = alert.reportId ? reports.get(alert.reportId) : undefined;
      if (!report) return alert;
      const details = alertDamageDetails(report);
      const openDamage = alert.type === "damage_reported" && !alert.archivedAt;
      const history = openDamage ? await historyFor(alert.vehicleId) : [];
      const compare = openDamage ? pairsForClient(beforeAfterPairs(report, history)) : undefined;
      // Who had the car last: found by, last clean check, everyone in between.
      const whoHadIt = openDamage ? whoHadItLast(report, history) : undefined;
      return {
        ...alert,
        details: {
          ...details,
          compare,
          whoHadIt,
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
    }));
    return NextResponse.json(
      { alerts: withDetails },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load alerts");
  }
}
