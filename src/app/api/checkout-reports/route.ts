import { errorResponse } from "@/lib/server/api-error";
import { assertDriverMayCheckVehicle } from "@/lib/server/driver-fleets";
import { vehicleIdsInScope } from "@/lib/server/fleet-scope";
import {
  assertOfficeAccess,
  canViewArchivedRecords,
  resolveRequestAuth,
} from "@/lib/server/request-auth";
import { NextRequest, NextResponse } from "next/server";
import {
  createReport,
  listReportPage,
} from "@/lib/server/checkout-repo";
import { OfficeListStatus } from "@/lib/office-list";
import type { CheckoutInspectionForm } from "@/lib/inspection-form";
import { CheckoutType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_STATUSES = new Set([
  "all",
  "flagged",
  "pending",
  "pass",
  "conditional",
  "fail",
  "archived",
]);

export async function GET(req: NextRequest) {
  try {
    const auth = await assertOfficeAccess(req);
    const params = req.nextUrl.searchParams;
    const statusParam = params.get("status");
    if (statusParam && !LIST_STATUSES.has(statusParam)) {
      return NextResponse.json({ error: "Unknown status filter" }, { status: 400 });
    }
    const ownerArchive = canViewArchivedRecords(auth);
    if (statusParam === "archived" && !ownerArchive) {
      return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
    }
    const started = performance.now();
    const page = await listReportPage(auth.orgId, {
      includeArchived:
        ownerArchive &&
        (params.get("includeArchived") === "1" || statusParam === "archived"),
      companyId: params.get("companyId") || undefined,
      vehicleId: params.get("vehicleId") || undefined,
      vehicleIds: await vehicleIdsInScope(auth),
      status: (statusParam as OfficeListStatus | null) || undefined,
      limit: params.has("limit") ? Number(params.get("limit")) : undefined,
      offset: params.has("offset") ? Number(params.get("offset")) : undefined,
    });
    const dur = (performance.now() - started).toFixed(1);
    return NextResponse.json(page, {
      headers: {
        "Cache-Control": "no-store",
        "Server-Timing": `list;dur=${dur}`,
      },
    });
  } catch (err) {
    return errorResponse(err, "Failed to load reports");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await resolveRequestAuth(req);
    const orgId = auth.orgId;
    const body = (await req.json()) as {
      companyId?: string;
      vehicleId?: string;
      unitNumber?: string;
      plate?: string;
      year?: number;
      make?: string;
      model?: string;
      odometer?: number;
      driverName?: string;
      dispatcherName?: string;
      type?: CheckoutType;
      inspectionForm?: CheckoutInspectionForm;
      signatureDataUrl?: string;
      signedAt?: string;
      idempotencyKey?: string;
    };
    if (
      !body.companyId ||
      !body.vehicleId ||
      !body.unitNumber ||
      !body.make ||
      !body.model ||
      !body.driverName ||
      !body.dispatcherName ||
      body.year == null ||
      body.odometer == null
    ) {
      return NextResponse.json(
        { error: "Missing required checkout fields" },
        { status: 400 }
      );
    }
    if (
      body.signatureDataUrl &&
      (!/^data:image\/(png|jpeg|webp);base64,/.test(body.signatureDataUrl) ||
        body.signatureDataUrl.length > 700_000)
    ) {
      return NextResponse.json({ error: "Signature image is invalid or too large" }, { status: 400 });
    }
    await assertDriverMayCheckVehicle(auth, body.vehicleId);
    const report = await createReport(orgId, {
      companyId: body.companyId,
      vehicleId: body.vehicleId,
      unitNumber: body.unitNumber,
      plate: body.plate,
      year: Number(body.year),
      make: body.make,
      model: body.model,
      odometer: Number(body.odometer),
      driverName: body.driverName,
      dispatcherName: body.dispatcherName,
      type: body.type === "check_in" ? "check_in" : "check_out",
      inspectionForm: body.inspectionForm,
      signatureDataUrl: body.signatureDataUrl,
      signedAt: body.signedAt,
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Failed to create report");
  }
}
