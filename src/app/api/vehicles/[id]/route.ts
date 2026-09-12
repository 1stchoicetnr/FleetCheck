import { NextResponse } from "next/server";
import {
  setVehicleArchived,
  SharedBackendError,
} from "@/lib/server/checkout-repo";
import { assertOfficePin } from "@/lib/server/office-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    assertOfficePin(req);
    const { id } = await params;
    const body = (await req.json()) as { archived?: boolean };
    if (typeof body.archived !== "boolean") {
      return NextResponse.json(
        { error: "archived must be true or false" },
        { status: 400 }
      );
    }
    const vehicle = await setVehicleArchived(id, body.archived);
    return NextResponse.json({ vehicle });
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
