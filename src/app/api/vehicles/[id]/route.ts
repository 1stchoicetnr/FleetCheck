import { NextResponse } from "next/server";
import {
  setVehicleArchived,
  setVehiclePowertrain,
  SharedBackendError,
} from "@/lib/server/checkout-repo";
import { assertOfficePin } from "@/lib/server/office-pin";
import type { Powertrain } from "@/lib/inspection-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertOfficePin(req);
    const { id } = await params;
    const body = (await req.json()) as {
      archived?: boolean;
      powertrain?: Powertrain;
    };
    if (typeof body.archived === "boolean") {
      const vehicle = await setVehicleArchived(id, body.archived);
      return NextResponse.json({ vehicle });
    }
    if (body.powertrain === "ev" || body.powertrain === "gas") {
      const vehicle = await setVehiclePowertrain(id, body.powertrain);
      return NextResponse.json({ vehicle });
    }
    return NextResponse.json(
      { error: "archived (boolean) or powertrain (gas|ev) is required" },
      { status: 400 }
    );
  } catch (err) {
    const status =
      (err as { status?: number }).status ||
      (err instanceof SharedBackendError ? err.status : 500);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update unit" },
      { status }
    );
  }
}
