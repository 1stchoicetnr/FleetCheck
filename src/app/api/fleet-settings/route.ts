import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import {
  getFleetSettings,
  updateFleetSettings,
} from "@/lib/server/checkout-repo";
import { assertOwnerAccess, orgIdFromRequest } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const settings = await getFleetSettings(await orgIdFromRequest(req));
    return NextResponse.json(
      { settings },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Failed to load settings");
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await assertOwnerAccess(req);
    const body = (await req.json()) as {
      allowDriverAddVehicles?: boolean;
    };
    if (typeof body.allowDriverAddVehicles !== "boolean") {
      return NextResponse.json(
        { error: "allowDriverAddVehicles (boolean) is required" },
        { status: 400 }
      );
    }
    const settings = await updateFleetSettings(auth.orgId, {
      allowDriverAddVehicles: body.allowDriverAddVehicles,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    return errorResponse(err, "Failed to save settings");
  }
}
