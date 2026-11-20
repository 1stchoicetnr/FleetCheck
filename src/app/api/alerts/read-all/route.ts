import { errorResponse } from "@/lib/server/api-error";
import { listOfficeAlerts, setOfficeAlertsRead } from "@/lib/server/checkout-repo";
import { vehicleIdsInScope } from "@/lib/server/fleet-scope";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mark every open, unread alert this person can see as read (org-wide).
 * Same access as archive: office access, and only units in their fleets.
 * An optional `ids` list narrows it to those alerts (still scope-checked).
 */
export async function POST(req: Request) {
  try {
    const auth = await assertOfficeAccess(req);
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    const only = Array.isArray(body.ids) ? new Set(body.ids.map(String)) : null;
    const allowed = await vehicleIdsInScope(auth);
    const ids = (await listOfficeAlerts(auth.orgId, false))
      .filter((alert) => !alert.read)
      .filter((alert) => (allowed ? allowed.includes(alert.vehicleId) : true))
      .filter((alert) => (only ? only.has(alert.id) : true))
      .map((alert) => alert.id);
    const updated = await setOfficeAlertsRead(
      auth.orgId,
      ids,
      true,
      auth.name || auth.email || (auth.source === "pin" ? "Office" : null)
    );
    return NextResponse.json({ ok: true, count: updated.length });
  } catch (err) {
    return errorResponse(err, "Failed to mark alerts read");
  }
}
