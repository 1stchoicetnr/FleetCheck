import { toClientReport } from "@/lib/photo-url";
import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import {
  deleteReport,
  getReport,
  reviewReport,
  setReportArchived,
} from "@/lib/server/checkout-repo";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { assertOfficeAccess, canViewArchivedRecords } from "@/lib/server/request-auth";
import { CheckoutReviewStatus, PhotoAngle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    const report = await getReport(auth.orgId, id);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertVehicleInScope(auth, report.vehicleId);
    return NextResponse.json(
      { report: toClientReport(report) },
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
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    const orgId = auth.orgId;
    const existing = await getReport(orgId, id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertVehicleInScope(auth, existing.vehicleId);
    const body = (await req.json()) as {
      archived?: boolean;
      reviewStatus?: CheckoutReviewStatus;
      reviewNotes?: string;
      newDamageNotes?: string;
      retakeAngles?: PhotoAngle[];
      reviewedBy?: string;
    };
    if (typeof body.archived === "boolean") {
      if (body.archived === false && !canViewArchivedRecords(auth)) {
        return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
      }
      const report = await setReportArchived(orgId, id, body.archived);
      return NextResponse.json({ report: toClientReport(report) });
    }
    if (!body.reviewStatus || !body.reviewedBy) {
      return NextResponse.json(
        { error: "reviewStatus and reviewedBy are required" },
        { status: 400 }
      );
    }
    const report = await reviewReport(orgId, id, {
      reviewStatus: body.reviewStatus,
      reviewNotes: body.reviewNotes,
      newDamageNotes: body.newDamageNotes,
      retakeAngles: body.retakeAngles,
      reviewedBy: body.reviewedBy,
    });
    return NextResponse.json({ report: toClientReport(report) });
  } catch (err) {
    return errorResponse(err, "Failed to save review");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    const existing = await getReport(auth.orgId, id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await assertVehicleInScope(auth, existing.vehicleId);
    await deleteReport(auth.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Failed to delete report");
  }
}
