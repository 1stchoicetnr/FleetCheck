import { errorResponse } from "@/lib/server/api-error";
import { reviewMarkFor } from "@/lib/known-damage";
import {
  getReport,
  listOfficeAlerts,
  setOfficeAlertArchived,
  setPhotoDamageReview,
} from "@/lib/server/checkout-repo";
import { checkoutAlertId } from "@/lib/checkout-alert-rules";
import { recordMissedDamageAlert } from "@/lib/server/report-alerts";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import type { PhotoAngle } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Office review of a driver's known-damage answer on one photo.
 * - not_new: driver reported new damage that wasn't. Closes (archives) the
 *   check's damage alert and records a false-report mark on the driver.
 * - actually_new: driver said "Same as before" but it is new. Adds the damage
 *   alert to the office queue and records a missed-damage mark.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { angle?: string; verdict?: string };
    if (body.verdict !== "not_new" && body.verdict !== "actually_new") {
      return NextResponse.json({ error: "verdict must be not_new or actually_new" }, { status: 400 });
    }
    const report = await getReport(auth.orgId, id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertVehicleInScope(auth, report.vehicleId);
    const photo = report.photos.find((p) => p.angle === body.angle);
    if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    const kind = reviewMarkFor(photo, body.verdict);
    if (typeof kind !== "string") return NextResponse.json({ error: kind.error }, { status: 400 });
    const saved = await setPhotoDamageReview(auth.orgId, id, photo.angle as PhotoAngle, {
      kind,
      by: auth.name || auth.email || "Office",
      at: new Date().toISOString(),
    });
    let alert: "archived" | "created" | "unchanged" = "unchanged";
    if (kind === "false_report") {
      const alertId = checkoutAlertId(id, "damage_reported");
      const open = (await listOfficeAlerts(auth.orgId, false)).some((a) => a.id === alertId);
      if (open) {
        await setOfficeAlertArchived(auth.orgId, alertId, true);
        alert = "archived";
      }
    } else if (await recordMissedDamageAlert(auth.orgId, saved)) {
      alert = "created";
    }
    return NextResponse.json({ ok: true, kind, alert });
  } catch (err) {
    return errorResponse(err, "Failed to save the review");
  }
}
