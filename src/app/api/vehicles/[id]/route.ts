import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import {
  getVehicle,
  setVehicleOutOfService,
  setVehicleArchived,
  setVehiclePowertrain,
  setVehicleService,
} from "@/lib/server/checkout-repo";
import { assertVehicleInScope } from "@/lib/server/fleet-scope";
import { isOfficeRequest } from "@/lib/server/office-pin";
import { resolveRequestAuth, sessionGrantsUnitEdit } from "@/lib/server/request-auth";
import type { Powertrain } from "@/lib/inspection-form";
import type { VehicleKnownIssue } from "@/lib/types";
import {
  canReturnToReady,
  canSetOutOfService,
  cleanOutOfServiceInput,
} from "@/lib/out-of-service";
import { recordVehicleOutOfService } from "@/lib/server/report-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let auth = await resolveRequestAuth(req);
    const body = (await req.json()) as {
      archived?: boolean;
      powertrain?: Powertrain;
      knownIssue?: VehicleKnownIssue | null;
      lastOilChangeMileage?: number | null;
      outOfService?: boolean;
      reason?: string;
    };
    const oos = cleanOutOfServiceInput(body);
    if (oos) {
      // Office may take a unit out of service; only Manager/Owner put it back to Ready.
      // The office PIN stands in for an owner, as for other unit edits.
      if (!canSetOutOfService(auth.role) && (await isOfficeRequest(req))) {
        auth = { ...auth, role: "owner", source: "pin" };
      }
      if ("error" in oos) return NextResponse.json({ error: oos.error }, { status: 400 });
      const allowed = oos.outOfService ? canSetOutOfService(auth.role) : canReturnToReady(auth.role);
      if (!allowed) {
        return NextResponse.json(
          {
            error: oos.outOfService
              ? "Office access is required."
              : "Only a Manager or Owner can set this unit back to Ready.",
          },
          { status: 403 }
        );
      }
      const { id } = await params;
      await assertVehicleInScope(auth, id);
      const before = await getVehicle(auth.orgId, id);
      if (!before) return NextResponse.json({ error: "Unit not found" }, { status: 404 });
      const by = auth.name || auth.email || "Office";
      if (oos.outOfService && before.outOfService) {
        return NextResponse.json({ vehicle: before });
      }
      const vehicle = await setVehicleOutOfService(
        auth.orgId,
        id,
        oos.outOfService
          ? { since: new Date().toISOString(), by, ...(oos.reason ? { reason: oos.reason } : {}) }
          : null
      );
      if (oos.outOfService) {
        await recordVehicleOutOfService(auth.orgId, vehicle, req).catch((err) =>
          console.error("[out-of-service] alert failed", err)
        );
      }
      return NextResponse.json({ vehicle });
    }
    if (!sessionGrantsUnitEdit(auth)) {
      if (await isOfficeRequest(req)) {
        auth = { ...auth, role: "owner", source: "pin" };
      } else {
        return NextResponse.json({ error: "Manager access is required." }, { status: 403 });
      }
    }
    const { id } = await params;
    await assertVehicleInScope(auth, id);
    const orgId = auth.orgId;
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
