import { errorResponse } from "@/lib/server/api-error";
import { spotCheckPicks } from "@/lib/known-damage";
import { tallyWindows } from "@/lib/driver-tally";
import { listSameAsBeforeAnswers } from "@/lib/server/org-data";
import { listKnownDamageUnits } from "@/lib/server/known-damage-repo";
import { vehicleIdsInScope } from "@/lib/server/fleet-scope";
import { pgDb, pgMigrateAndSeed } from "@/lib/server/postgres-store";
import { sharedBackendMode } from "@/lib/server/shared-config";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weekly spot check: a few random "Same as before" answers from the past 7
 * days, each with the known-damage photo and the driver's photo, for office to
 * look at side by side. Stable for the week. Read-only.
 */
export async function GET(req: Request) {
  try {
    const auth = await assertOfficeAccess(req);
    if (sharedBackendMode() !== "postgres") {
      return NextResponse.json({ items: [] });
    }
    await pgMigrateAndSeed();
    const now = new Date();
    const end = now.toISOString();
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const week = tallyWindows(now).find((w) => w.kind === "week")?.key ?? end.slice(0, 10);
    const allowed = await vehicleIdsInScope(auth);
    const rows = (await listSameAsBeforeAnswers(pgDb(), auth.orgId, start, end)).filter((row) =>
      allowed ? allowed.includes(String(row.vehicle_id)) : true
    );
    const known = new Map(
      (await listKnownDamageUnits(auth.orgId)).flatMap((unit) => unit.items.map((item) => [item.id, item] as const))
    );
    const count = Math.min(5, Math.max(0, Number(new URL(req.url).searchParams.get("count")) || 5));
    const items = spotCheckPicks(
      rows.map((row) => ({
        key: `${row.report_id}:${row.angle}`,
        reportId: String(row.report_id),
        vehicleId: String(row.vehicle_id),
        unitNumber: String(row.unit_number ?? ""),
        plate: String(row.plate ?? ""),
        driverName: String(row.driver_name ?? ""),
        completedAt: new Date(String(row.completed_at)).toISOString(),
        angle: String(row.angle),
        reviewKind: row.review_kind ? String(row.review_kind) : undefined,
        known: known.get(String(row.known_damage_id)) ?? null,
        photoSrc: `/api/checkout-reports/${encodeURIComponent(String(row.report_id))}/photos/${encodeURIComponent(String(row.angle))}`,
      })),
      week,
      count
    );
    return NextResponse.json({ items, week, total: rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Failed to load the spot check");
  }
}
