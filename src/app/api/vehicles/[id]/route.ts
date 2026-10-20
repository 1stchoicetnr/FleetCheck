import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import {
  setVehicleArchived,
  setVehiclePowertrain,
  setVehicleService,
} from "@/lib/server/checkout-repo";
import { assertOfficePin } from "@/lib/server/office-pin";
import { orgFromSession } from "@/lib/server/org-scope";
import type { Powertrain } from "@/lib/inspection-form";
import type { VehicleKnownIssue } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertOfficePin(req);
    const { id } = await params;
    const orgId = orgFromSession();
    const body = (await req.json()) as {
      archived?: boolean;
      powertrain?: Powertrain;
      knownIssue?: VehicleKnownIssue | null;
      lastOilChangeMileage?: number | null;
    };
    if (typeof body.archived === "boolean") {
      const vehicle = await setVehicleArchived(orgId, id, body.archived);
      return NextResponse.json({ vehicle });
    }
    if (body.powertrain === "ev" || body.powertrain === "gas") {
      const vehicle = await setVehiclePowertrain(orgId, id, body.powertrain);
      return NextResponse.json({ vehicle });
    }
    if (
      Object.prototype.hasOwnProperty.call(body, "knownIssue") ||
      Object.prototype.hasOwnProperty.call(body, "lastOilChangeMileage")
    ) {
      const vehicle = await setVehicleService(orgId, id, {
        knownIssue: Object.prototype.hasOwnProperty.call(body, "knownIssue")
          ? body.knownIssue
          : undefined,
        lastOilChangeMileage: Object.prototype.hasOwnProperty.call(
          body,
          "lastOilChangeMileage"
        )
          ? body.lastOilChangeMileage
          : undefined,
      });
      return NextResponse.json({ vehicle });
    }
    return NextResponse.json(
      { error: "archived, powertrain, knownIssue, or lastOilChangeMileage is required" },
      { status: 400 }
    );
  } catch (err) {
    return errorResponse(err, "Failed to update unit");
  }
}
