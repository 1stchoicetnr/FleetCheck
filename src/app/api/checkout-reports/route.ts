import { errorResponse } from "@/lib/server/api-error";
import { assertOfficePin } from "@/lib/server/office-pin";
import { NextRequest, NextResponse } from "next/server";
import {
  createReport,
  listReports,
} from "@/lib/server/checkout-repo";
import type { CheckoutInspectionForm } from "@/lib/inspection-form";
import { CheckoutType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await assertOfficePin(req);
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
    const reports = await listReports({ includeArchived });
    return NextResponse.json(
      { reports },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load reports");
  }
}

export async function POST(req: Request) {
  try {
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
    const report = await createReport({
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
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Failed to create report");
  }
}
