import { errorResponse } from "@/lib/server/api-error";
import { listOfficeAlerts } from "@/lib/server/checkout-repo";
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
    return NextResponse.json(
      { alerts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load alerts");
  }
}
