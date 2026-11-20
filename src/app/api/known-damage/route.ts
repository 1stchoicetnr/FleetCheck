import { errorResponse } from "@/lib/server/api-error";
import { activeKnownDamage, fixLaterCounts, pacificYmd } from "@/lib/known-damage";
import { listKnownDamageUnits } from "@/lib/server/known-damage-repo";
import { vehicleIdsInScope } from "@/lib/server/fleet-scope";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Office: active known damage by unit, plus Fix later / overdue counts (home badge). */
export async function GET(req: Request) {
  try {
    const auth = await assertOfficeAccess(req);
    const allowed = await vehicleIdsInScope(auth);
    const today = pacificYmd();
    const units = (await listKnownDamageUnits(auth.orgId))
      .filter((unit) => (allowed ? allowed.includes(unit.vehicleId) : true))
      .map((unit) => ({ ...unit, items: activeKnownDamage(unit.items) }))
      .filter((unit) => unit.items.length > 0);
    const counts = units.reduce(
      (sum, unit) => {
        const c = fixLaterCounts(unit.items, today);
        return { fixLater: sum.fixLater + c.fixLater, overdue: sum.overdue + c.overdue };
      },
      { fixLater: 0, overdue: 0 }
    );
    return NextResponse.json({ units, ...counts, today }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Failed to load known damage");
  }
}
