import { errorResponse } from "@/lib/server/api-error";
import { listOfficeAlerts } from "@/lib/server/checkout-repo";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await assertOfficeAccess(req);
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
    const alerts = await listOfficeAlerts(auth.orgId, includeArchived);
    return NextResponse.json(
      { alerts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load alerts");
  }
}
