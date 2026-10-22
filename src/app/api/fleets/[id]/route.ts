import { errorResponse } from "@/lib/server/api-error";
import { NextResponse } from "next/server";
import { deleteFleet, updateFleet } from "@/lib/server/checkout-repo";
import { assertFleetInScope } from "@/lib/server/fleet-scope";
import { assertOwnerAccess, assertPeopleAccess } from "@/lib/server/request-auth";
import { parseFleetName } from "@/lib/fleet-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertPeopleAccess(req);
    const { id } = await params;
    await assertFleetInScope(auth, id);
    const body = (await req.json()) as { name?: unknown; archived?: unknown };
    const patch: { name?: string; archived?: boolean } = {};
    if (body.name !== undefined) {
      const name = parseFleetName(body.name);
      if (!name) {
        return NextResponse.json({ error: "Enter a fleet name" }, { status: 400 });
      }
      patch.name = name;
    }
    if (body.archived !== undefined) {
      if (typeof body.archived !== "boolean") {
        return NextResponse.json({ error: "Archived must be true or false" }, { status: 400 });
      }
      patch.archived = body.archived;
    }
    if (patch.name === undefined && patch.archived === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    const fleet = await updateFleet(auth.orgId, id, patch);
    return NextResponse.json({ fleet });
  } catch (err) {
    return errorResponse(err, "Failed to update fleet");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertOwnerAccess(req);
    const { id } = await params;
    await deleteFleet(auth.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Failed to delete fleet");
  }
}
