import { errorResponse } from "@/lib/server/api-error";
import { priorReportForClient } from "@/lib/photo-url";
import { NextRequest, NextResponse } from "next/server";
import { getPriorReports } from "@/lib/server/checkout-repo";
import { assertDriverMayCheckVehicle } from "@/lib/server/driver-fleets";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { assertApprovedUser } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const vehicleId = req.nextUrl.searchParams.get("vehicleId");
    const currentId = req.nextUrl.searchParams.get("currentId") || undefined;
    if (!vehicleId) {
      return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
    }
    const auth = await assertApprovedUser(req);
    if (auth.role === "office" || auth.role === "manager") {
      await assertVehicleInScope(auth, vehicleId);
    } else if (auth.role === "driver") {
      await assertDriverMayCheckVehicle(auth, vehicleId);
    }
    const reports = await getPriorReports(auth.orgId, vehicleId, currentId, 2);
    return NextResponse.json(
      { reports: reports.map(priorReportForClient) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load priors");
  }
}
