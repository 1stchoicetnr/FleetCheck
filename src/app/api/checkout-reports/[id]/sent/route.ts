import { mayUpdateCheckout } from "@/lib/checkout-access";
import { toClientReport } from "@/lib/photo-url";
import { type ApiErrorContext, errorResponse, RequestError } from "@/lib/server/api-error";
import { slackLinkOrigin } from "@/lib/server/auth-http";
import { confirmReportSent, getReport } from "@/lib/server/checkout-repo";
import { isOfficeRequest } from "@/lib/server/office-pin";
import {
  assertCheckoutSubmitter,
  sessionGrantsOffice,
} from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx: ApiErrorContext = { route: "sent" };
  try {
    const { id } = await params;
    ctx.reportId = id;
    const auth = await assertCheckoutSubmitter(req);
    ctx.userId = auth.userId;
    ctx.userName = auth.name;
    const office = sessionGrantsOffice(auth) || (await isOfficeRequest(req));
    const body = (await req.json().catch(() => ({}))) as { withoutPhotos?: unknown };
    const existing = await getReport(auth.orgId, id);
    if (!existing) throw new RequestError("Not found", 404);
    if (
      !mayUpdateCheckout({
        office,
        userId: auth.userId,
        userName: auth.name,
        driverUserId: existing.driverUserId,
        driverName: existing.driverName,
      })
    ) {
      throw new RequestError("You can only send your own check.", 403);
    }
    // Age does not block this. New photos still close after 6 hours.
    // Office can record sent even if a required photo is missing, and a checkout
    // already in Slack is not posted again. A driver whose photo window has
    // closed can send without the photos; the office sees it as missing photos.
    const report = await confirmReportSent(auth.orgId, id, {
      appOrigin: slackLinkOrigin(req),
      office,
      withoutPhotos: body.withoutPhotos === true,
    });
    console.log(`[checkout-sent] report=${id} result=saved`);
    return NextResponse.json({ report: toClientReport(report) });
  } catch (err) {
    return errorResponse(err, "Failed to mark the check sent", ctx);
  }
}
