import { errorResponse } from "@/lib/server/api-error";
import { deleteOfficeAlert, setOfficeAlertArchived } from "@/lib/server/checkout-repo";
import { assertOfficePin } from "@/lib/server/office-pin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertOfficePin(req);
    const { id } = await params;
    const body = (await req.json()) as { archived?: boolean };
    if (typeof body.archived !== "boolean") {
      return NextResponse.json({ error: "archived (boolean) is required" }, { status: 400 });
    }
    const alert = await setOfficeAlertArchived(id, body.archived);
    return NextResponse.json({ alert });
  } catch (err) {
    return errorResponse(err, "Failed to update alert");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await assertOfficePin(req);
    const { id } = await params;
    await deleteOfficeAlert(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Failed to delete alert");
  }
}
