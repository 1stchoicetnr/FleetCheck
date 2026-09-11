import { NextRequest, NextResponse } from "next/server";
import { listVehicles, SharedBackendError } from "@/lib/server/checkout-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
    const vehicles = await listVehicles(companyId);
    return NextResponse.json(
      { vehicles },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load vehicles" },
      { status }
    );
  }
}
