import { errorResponse, RequestError } from "@/lib/server/api-error";
import { slackLinkOrigin } from "@/lib/server/auth-http";
import { confirmReportSent, getReport } from "@/lib/server/checkout-repo";
import { isOfficeRequest } from "@/lib/server/office-pin";
import { resolveRequestAuth, sessionGrantsOffice } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRIVER_WINDOW_MS = 6 * 60 * 60 * 1000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await resolveRequestAuth(req);
    const office = sessionGrantsOffice(auth) || (await isOfficeRequest(req));
    const existing = await getReport(auth.orgId, id);
    if (!existing) throw new RequestError("Not found", 404);
    const created = Date.parse(existing.createdAt);
    if (!office && (!Number.isFinite(created) || Date.now() - created > DRIVER_WINDOW_MS)) {
      throw new RequestError("This checkout is closed. Ask the office.", 403);
    }
    const report = await confirmReportSent(auth.orgId, id, {
      appOrigin: slackLinkOrigin(req),
    });
    return NextResponse.json({ report });
  } catch (err) {
    return errorResponse(err, "Failed to mark the check sent");
  }
}
