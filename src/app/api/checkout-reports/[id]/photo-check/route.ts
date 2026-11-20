import { errorResponse } from "@/lib/server/api-error";
import { openPhotoCheckFindings } from "@/lib/photo-check";
import {
  getReport,
  listOfficeAlerts,
  setOfficeAlertArchived,
  setPhotoChecks,
} from "@/lib/server/checkout-repo";
import { recordMissedDamageAlert } from "@/lib/server/report-alerts";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Office decision on a "Found by photo check" finding.
 * - confirm: it is new damage. The slot is flagged, normal notifications go
 *   out (alert + repair report to #rad-cab-repairs, Mark, and Bell), and a
 *   driver who answered "Same as before" gets a missed-damage mark.
 * - dismiss: no damage. Nothing is sent.
 * The photo-check alert closes when no findings on the check are left open.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { angle?: string; verdict?: string };
    if (body.verdict !== "confirm" && body.verdict !== "dismiss") {
      return NextResponse.json({ error: "verdict must be confirm or dismiss" }, { status: 400 });
    }
    const report = await getReport(auth.orgId, id);
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await assertVehicleInScope(auth, report.vehicleId);
    const photo = report.photos.find((p) => p.angle === body.angle);
    if (!photo?.photoCheck?.changed) {
      return NextResponse.json({ error: "No photo check finding on that photo" }, { status: 404 });
    }
    if (photo.photoCheck.review) {
      return NextResponse.json({ ok: true, already: photo.photoCheck.review.verdict });
    }
    const by = auth.name || auth.email || "Office";
    const at = new Date().toISOString();
    const confirmed = body.verdict === "confirm";
    const saved = await setPhotoChecks(auth.orgId, id, (p) => {
      if (p.angle !== photo.angle || !p.photoCheck) return p;
      const reviewed = { ...p, photoCheck: { ...p.photoCheck, review: { verdict: confirmed ? "confirmed" as const : "dismissed" as const, by, at } } };
      if (!confirmed) return reviewed;
      return {
        ...reviewed,
        flaggedDamage: true,
        damageNote: p.damageNote || `Found by photo check: ${p.photoCheck.summary}`.slice(0, 500),
        ...(p.knownDamageAnswer === "same" ? { damageReview: { kind: "missed_damage" as const, by, at } } : {}),
      };
    });
    let alert: "created" | "unchanged" = "unchanged";
    if (confirmed && (await recordMissedDamageAlert(auth.orgId, saved, { fallbackId: `${id}:damage_photo_check` }))) {
      alert = "created";
    }
    const alertId = `${id}:photo_check`;
    if (!openPhotoCheckFindings(saved.photos).length) {
      const open = (await listOfficeAlerts(auth.orgId, false)).some((a) => a.id === alertId);
      if (open) await setOfficeAlertArchived(auth.orgId, alertId, true);
    }
    return NextResponse.json({ ok: true, verdict: confirmed ? "confirmed" : "dismissed", alert });
  } catch (err) {
    return errorResponse(err, "Failed to save the photo check decision");
  }
}
