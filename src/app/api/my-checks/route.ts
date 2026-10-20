import { errorResponse, RequestError } from "@/lib/server/api-error";
import { listMyReports } from "@/lib/server/checkout-repo";
import { resolveRequestAuth } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await resolveRequestAuth(req);
    if (!auth.name) throw new RequestError("Sign in required", 401);
    const reports = await listMyReports(auth.orgId, auth.name);
    return NextResponse.json(
      { reports },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load checks");
  }
}
