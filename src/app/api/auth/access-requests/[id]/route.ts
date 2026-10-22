import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { AuthError } from "@/lib/server/auth-accounts";
import { reviewAccessRequest } from "@/lib/server/access-requests";
import { isMemberRole } from "@/lib/server/member-role";
import { fleetScopeFor } from "@/lib/server/fleet-scope";
import { assertPeopleAccess, openAuthDb } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertPeopleAccess(req);
    if (!auth.role || !isMemberRole(auth.role)) {
      throw new AuthError("Manager access is required.", 401);
    }
    const scope = await fleetScopeFor(auth);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      role?: unknown;
      fleetIds?: unknown;
    };
    const action = body.action === "approve" || body.action === "deny" ? body.action : "";
    if (!action) throw new AuthError("Choose approve or deny.", 400);
    const fleetIds = Array.isArray(body.fleetIds)
      ? body.fleetIds.filter((item): item is string => typeof item === "string")
      : [];
    const db = await openAuthDb();
    await reviewAccessRequest(db, {
      orgId: auth.orgId,
      userId: id,
      action,
      role: typeof body.role === "string" ? body.role : "",
      fleetIds,
      actorRole: auth.role,
      actorFleetIds: scope.all ? null : scope.fleetIds,
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err, "Could not update that request.");
  }
}
