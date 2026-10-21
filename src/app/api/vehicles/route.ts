import { errorResponse } from "@/lib/server/api-error";
import { NextRequest, NextResponse } from "next/server";
import {
  findVehicleByPlate,
  listVehicles,
  upsertVehicle,
} from "@/lib/server/checkout-repo";
import { isOfficeRequest, assertOfficePin } from "@/lib/server/office-pin";
import { getFleetSettings } from "@/lib/server/checkout-repo";
import { filterVehiclesForDriver } from "@/lib/server/driver-fleets";
import { resolveRequestAuth, sessionGrantsOffice } from "@/lib/server/request-auth";
import { parseIncludeArchived } from "@/lib/vehicle-archive";
import type { Powertrain } from "@/lib/inspection-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveRequestAuth(req);
    const orgId = auth.orgId;
    const companyId = req.nextUrl.searchParams.get("companyId") || undefined;
    const plate = req.nextUrl.searchParams.get("plate") || undefined;
    if (companyId && plate) {
      const found = await findVehicleByPlate(orgId, companyId, plate);
      const vehicles = await filterVehiclesForDriver(auth, found ? [found] : []);
      const vehicle = vehicles[0] ?? null;
      return NextResponse.json(
        { vehicle, vehicles: vehicle ? [vehicle] : [] },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    // Drivers may list one company's units; the all-company list is office-only.
    if (!companyId && !sessionGrantsOffice(auth)) await assertOfficePin(req);
    const includeArchived = parseIncludeArchived(
      req.nextUrl.searchParams.get("includeArchived")
    );
    const vehicles = await filterVehiclesForDriver(
      auth,
      await listVehicles(orgId, companyId, { includeArchived })
    );
    return NextResponse.json(
      { vehicles },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load vehicles");
  }
}

export async function POST(req: Request) {
  try {
    const auth = await resolveRequestAuth(req);
    const body = (await req.json()) as {
      companyId?: string;
      fleetId?: string;
      unitNumber?: string;
      plate?: string;
      make?: string;
      model?: string;
      year?: number;
      powertrain?: Powertrain;
    };
    if (!body.companyId || !body.plate || !body.make || !body.model || body.year == null) {
      return NextResponse.json(
        { error: "Company, plate, year, make, and model are required" },
        { status: 400 }
      );
    }
    const office = sessionGrantsOffice(auth) || (await isOfficeRequest(req));
    if (!office) {
      // Driver (no PIN): may add a new unit only when the office toggle is on,
      // or update just the powertrain of a unit that already exists.
      const orgId = auth.orgId;
      const existing = await findVehicleByPlate(orgId, body.companyId, body.plate);
      if (existing) {
        const vehicle = await upsertVehicle(orgId, {
          companyId: existing.companyId,
          unitNumber: existing.unitNumber,
          plate: existing.plate,
          make: existing.make,
          model: existing.model,
          year: existing.year,
          powertrain: body.powertrain ?? existing.powertrain,
        });
        return NextResponse.json({ vehicle }, { status: 200 });
      }
      const settings = await getFleetSettings(orgId);
      if (!settings.allowDriverAddVehicles) {
        return NextResponse.json(
          { error: "Only the office can add units right now." },
          { status: 403 }
        );
      }
    }
    const vehicle = await upsertVehicle(auth.orgId, {
      companyId: body.companyId,
      fleetId: body.fleetId?.trim() || undefined,
      unitNumber: body.unitNumber,
      plate: body.plate,
      make: body.make,
      model: body.model,
      year: Number(body.year),
      powertrain: body.powertrain,
    });
    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "Failed to save unit");
  }
}
