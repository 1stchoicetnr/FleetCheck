import { errorResponse } from "@/lib/server/api-error";
import { deleteOfficeAlert, setOfficeAlertArchived } from "@/lib/server/checkout-repo";
import { assertOfficeAccess, canViewArchivedRecords } from "@/lib/server/request-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    const body = (await req.json()) as { archived?: boolean };
    if (typeof body.archived !== "boolean") {
      return NextResponse.json({ error: "archived (boolean) is required" }, { status: 400 });
    }
    if (body.archived === false && !canViewArchivedRecords(auth)) {
      return NextResponse.json({ error: "Owner access is required." }, { status: 403 });
    }
    const alert = await setOfficeAlertArchived(auth.orgId, id, body.archived);
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
    const auth = await assertOfficeAccess(req);
    const { id } = await params;
    await deleteOfficeAlert(auth.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Failed to delete alert");
  }
}
