import { errorResponse } from "@/lib/server/api-error";
import { slackLinkOrigin } from "@/lib/server/auth-http";
import { resendReportToSlack } from "@/lib/server/checkout-repo";
import { assertOwnerAccess } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertOwnerAccess(req);
    const { id } = await params;
    const status = await resendReportToSlack(auth.orgId, id, {
      appOrigin: slackLinkOrigin(req),
    });
    return NextResponse.json({ status });
  } catch (err) {
    return errorResponse(err, "Could not resend that check");
  }
}
