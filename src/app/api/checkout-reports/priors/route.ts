import { NextRequest, NextResponse } from "next/server";
import { getPriorReports, SharedBackendError } from "@/lib/server/checkout-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const vehicleId = req.nextUrl.searchParams.get("vehicleId");
    const currentId = req.nextUrl.searchParams.get("currentId") || undefined;
    if (!vehicleId) {
      return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
    }
    const reports = await getPriorReports(vehicleId, currentId, 2);
    return NextResponse.json(
      { reports },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load priors" },
      { status }
    );
  }
}
