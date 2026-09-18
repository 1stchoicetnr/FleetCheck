import { NextResponse } from "next/server";
import {
  getReport,
  reviewReport,
  SharedBackendError,
} from "@/lib/server/checkout-repo";
import { assertOfficePin } from "@/lib/server/office-pin";
import { CheckoutReviewStatus, PhotoAngle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const report = await getReport(id);
    return NextResponse.json(
      { report: report ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load report" },
      { status }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertOfficePin(req);
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
    const status =
      (err as { status?: number }).status ||
      (err instanceof SharedBackendError ? err.status : 500);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save review" },
      { status }
    );
  }
}
