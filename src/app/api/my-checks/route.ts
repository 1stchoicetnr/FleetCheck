import { toClientReport } from "@/lib/photo-url";
import { errorResponse, RequestError } from "@/lib/server/api-error";
import { listMyReports } from "@/lib/server/checkout-repo";
import { resolveRequestAuth } from "@/lib/server/request-auth";
import { after, NextResponse } from "next/server";
import { upkeepSoon } from "@/lib/server/checkout-upkeep";
import { slackLinkOrigin } from "@/lib/server/auth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await resolveRequestAuth(req);
    if (!auth.userId || !auth.name) throw new RequestError("Sign in required", 401);
    const reports = await listMyReports(auth.orgId, auth.name, auth.userId);
    const orgId = auth.orgId;
    const origin = slackLinkOrigin(req);
    after(() => upkeepSoon(orgId, origin) ?? undefined);
    return NextResponse.json(
      { reports: reports.map(toClientReport) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load checks");
  }
}
