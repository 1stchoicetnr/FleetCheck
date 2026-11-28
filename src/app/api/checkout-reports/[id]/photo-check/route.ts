import { errorResponse } from "@/lib/server/api-error";
import { activeKnownCovers } from "@/lib/photo-check-on-file";
import {
  knownNotFixingFromFinding,
  openPhotoCheckFindings,
  photoCheckOfficeDecision,
  type PhotoCheckOfficeVerdict,
} from "@/lib/photo-check";
import {
  getReport,
  listOfficeAlerts,
  setOfficeAlertArchived,
  setPhotoChecks,
} from "@/lib/server/checkout-repo";
import { addKnownDamage, listKnownDamage } from "@/lib/server/known-damage-repo";
import { recordMissedDamageAlert } from "@/lib/server/report-alerts";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isVerdict(value: unknown): value is PhotoCheckOfficeVerdict {
  return value === "confirm" || value === "dismiss" || value === "already_known";
}

/**
 * Office decision on a "Found by photo check" finding.
 * - confirm: it is new damage. The slot is flagged, the office alert is
 *   created, and Rad Cab queues it for the daily repair digest. A driver who
 *   answered "Same as before" gets a missed-damage mark.
 * - already_known: add it to the unit as Known – not fixing and close the
 *   finding. Nothing is posted.
 * - dismiss: no damage. Nothing is sent.
 * The photo-check alert closes when no findings on the check are left open.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { angle?: string; verdict?: string };
    if (!isVerdict(body.verdict)) {
      return NextResponse.json({ error: "verdict must be confirm, dismiss, or already_known" }, { status: 400 });
    }
    const decision = photoCheckOfficeDecision(body.verdict);
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
    if (decision.markKnown) {
      const input = knownNotFixingFromFinding({
        angle: photo.angle,
        summary: photo.photoCheck.summary,
        reportId: id,
        alertId: `${id}:photo_check`,
      });
      if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
      const existing = await listKnownDamage(auth.orgId, report.vehicleId);
      if (!activeKnownCovers(existing, input)) await addKnownDamage(auth.orgId, report.vehicleId, input, by);
    }
    const saved = await setPhotoChecks(auth.orgId, id, (p) => {
      if (p.angle !== photo.angle || !p.photoCheck) return p;
      const reviewed = {
        ...p,
        photoCheck: { ...p.photoCheck, review: { verdict: decision.review, by, at } },
      };
      if (!decision.flagDamage) return reviewed;
      return {
        ...reviewed,
        flaggedDamage: true,
        damageNote: p.damageNote || `Found by photo check: ${p.photoCheck.summary}`.slice(0, 500),
        ...(p.knownDamageAnswer === "same" ? { damageReview: { kind: "missed_damage" as const, by, at } } : {}),
      };
    });
    let alert: "created" | "unchanged" = "unchanged";
    if (decision.queueAlert && (await recordMissedDamageAlert(auth.orgId, saved, { fallbackId: `${id}:damage_photo_check` }))) {
      alert = "created";
    }
    const alertId = `${id}:photo_check`;
    if (!openPhotoCheckFindings(saved.photos).length) {
      const open = (await listOfficeAlerts(auth.orgId, false)).some((a) => a.id === alertId);
      if (open) await setOfficeAlertArchived(auth.orgId, alertId, true);
    }
    return NextResponse.json({ ok: true, verdict: decision.review, alert });
  } catch (err) {
    return errorResponse(err, "Failed to save the photo check decision");
  }
}
