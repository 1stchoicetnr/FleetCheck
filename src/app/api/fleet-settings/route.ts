import { assertOfficePin } from "@/lib/server/office-pin";
import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import {
  getFleetSettings,
  updateFleetSettings,
} from "@/lib/server/checkout-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getFleetSettings();
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
    await assertOfficePin(req);
    const body = (await req.json()) as {
      allowDriverAddVehicles?: boolean;
    };
    if (typeof body.allowDriverAddVehicles !== "boolean") {
      return NextResponse.json(
        { error: "allowDriverAddVehicles (boolean) is required" },
        { status: 400 }
      );
    }
    const settings = await updateFleetSettings({
      allowDriverAddVehicles: body.allowDriverAddVehicles,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    return errorResponse(err, "Failed to save settings");
  }
}
