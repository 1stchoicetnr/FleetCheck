import { errorResponse } from "@/lib/server/api-error";
import { listOfficeAlerts } from "@/lib/server/checkout-repo";
import { assertOfficePin } from "@/lib/server/office-pin";
import { orgFromSession } from "@/lib/server/org-scope";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await assertOfficePin(req);
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
    const alerts = await listOfficeAlerts(orgFromSession(), includeArchived);
    return NextResponse.json(
      { alerts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load alerts");
  }
}
