import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import {
  deleteReport,
  getReport,
  reviewReport,
  setReportArchived,
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
      archived?: boolean;
      reviewStatus?: CheckoutReviewStatus;
      reviewNotes?: string;
      newDamageNotes?: string;
      retakeAngles?: PhotoAngle[];
      reviewedBy?: string;
    };
    if (typeof body.archived === "boolean") {
      const report = await setReportArchived(id, body.archived);
      return NextResponse.json({ report });
    }
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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertOfficePin(req);
    const { id } = await params;
    await deleteReport(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Failed to delete report");
  }
}
