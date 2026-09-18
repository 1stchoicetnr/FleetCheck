import { NextResponse } from "next/server";
import {
  getFleetSettings,
  SharedBackendError,
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
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load settings" },
      { status }
    );
  }
}

export async function PATCH(req: Request) {
  try {
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
    const status = err instanceof SharedBackendError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save settings" },
      { status }
    );
  }
}
