import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { assertCanRemoveUser, removeThrowawayUser } from "@/lib/server/auth-accounts";
import { fleetScopeFor } from "@/lib/server/fleet-scope";
import { getUser } from "@/lib/server/org-data";
import { updatePersonAccess } from "@/lib/server/people-admin";
import { assertOwnerAccess, assertPeopleAccess, openAuthDb } from "@/lib/server/request-auth";
import { isMemberRole } from "@/lib/server/member-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertPeopleAccess(req);
    if (!auth.role || !isMemberRole(auth.role)) {
      return NextResponse.json({ error: "Manager access is required." }, { status: 401 });
    }
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      role?: unknown;
      active?: unknown;
      fleetIds?: unknown;
    };
    const scope = await fleetScopeFor(auth);
    const db = await openAuthDb();
    await updatePersonAccess(db, {
      orgId: auth.orgId,
      userId: id,
      actorRole: auth.role,
      actorFleetIds: scope.all ? null : scope.fleetIds,
      role: typeof body.role === "string" ? body.role : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
      fleetIds: Array.isArray(body.fleetIds)
        ? body.fleetIds.filter((item): item is string => typeof item === "string")
        : undefined,
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Could not update that person.");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertOwnerAccess(req);
    const { id } = await params;
    if (auth.userId && auth.userId === id) {
      return NextResponse.json(
        { error: "You cannot delete your own login." },
        { status: 403 }
      );
    }
    assertCanRemoveUser(id);
    const db = await openAuthDb();
    const existing = await getUser(db, auth.orgId, id);
    const removed = await removeThrowawayUser(
      db,
      auth.orgId,
      id,
      existing ? String(existing.email) : undefined
    );
    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not remove that person.");
  }
}
