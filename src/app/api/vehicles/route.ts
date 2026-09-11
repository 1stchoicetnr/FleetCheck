import { NextRequest, NextResponse } from "next/server";
import {
  findVehicleByPlate,
  listVehicles,
  SharedBackendError,
  upsertVehicle,
} from "@/lib/server/checkout-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
    const plate = req.nextUrl.searchParams.get("plate") || undefined;
    if (companyId && plate) {
      const vehicle = await findVehicleByPlate(companyId, plate);
      return NextResponse.json(
        { vehicle: vehicle ?? null, vehicles: vehicle ? [vehicle] : [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const vehicles = await listVehicles(companyId);
    return NextResponse.json(
      { vehicles },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load vehicles" },
      { status }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      companyId?: string;
      unitNumber?: string;
      plate?: string;
      make?: string;
      model?: string;
      year?: number;
    };
    if (!body.companyId || !body.plate || !body.make || !body.model || body.year == null) {
      return NextResponse.json(
        { error: "Company, plate, year, make, and model are required" },
        { status: 400 }
      );
    }
    const vehicle = await upsertVehicle({
      companyId: body.companyId,
      unitNumber: body.unitNumber,
      plate: body.plate,
      make: body.make,
      model: body.model,
      year: Number(body.year),
    });
    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (err) {
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save unit" },
      { status }
    );
  }
}
