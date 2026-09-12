import { NextResponse } from "next/server";
import {
  createReport,
  listReports,
  SharedBackendError,
} from "@/lib/server/checkout-repo";
import type { CheckoutInspectionForm } from "@/lib/inspection-form";
import { CheckoutType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const reports = await listReports();
    return NextResponse.json(
      { reports },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load reports" },
      { status }
    );
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
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create report" },
      { status }
    );
  }
}
