import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import {
  getReport,
  reviewReport,
} from "@/lib/server/checkout-repo";
import { assertOfficePin } from "@/lib/server/office-pin";
import { CheckoutReviewStatus, PhotoAngle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertOfficePin(req);
    const { id } = await params;
    const report = await getReport(id);
    return NextResponse.json(
      { report: report ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load report");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertOfficePin(req);
    const { id } = await params;
    const body = (await req.json()) as {
      reviewStatus?: CheckoutReviewStatus;
      reviewNotes?: string;
      newDamageNotes?: string;
      retakeAngles?: PhotoAngle[];
      reviewedBy?: string;
    };
    if (!body.reviewStatus || !body.reviewedBy) {
      return NextResponse.json(
        { error: "reviewStatus and reviewedBy are required" },
        { status: 400 }
      );
    }
    const report = await reviewReport(id, {
      reviewStatus: body.reviewStatus,
      reviewNotes: body.reviewNotes,
      newDamageNotes: body.newDamageNotes,
      retakeAngles: body.retakeAngles,
      reviewedBy: body.reviewedBy,
    });
    return NextResponse.json({ report });
  } catch (err) {
    return errorResponse(err, "Failed to save review");
  }
}
