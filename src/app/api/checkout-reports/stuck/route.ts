import { errorResponse } from "@/lib/server/api-error";
import { listStuckChecks } from "@/lib/server/checkout-repo";
import { assertOfficeAccess } from "@/lib/server/request-auth";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only: checks stuck on phones or sent without photos, last 14 days. Office, Manager, Owner. */
export async function GET(req: NextRequest) {
  try {
    const auth = await assertOfficeAccess(req);
    const result = await listStuckChecks(auth.orgId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Failed to load stuck checks");
  }
}
