import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { AuthError } from "@/lib/server/auth-accounts";
import { getInviteById, revokeInvite } from "@/lib/server/auth-store";
import { fleetScopeFor } from "@/lib/server/fleet-scope";
import { assertPeopleAccess, openAuthDb } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inviteFleetIds(value: string | null | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await assertPeopleAccess(req);
    const { id } = await params;
    const db = await openAuthDb();
    const invite = await getInviteById(db, auth.orgId, id);
    if (!invite || invite.used_at || invite.revoked_at) {
      return NextResponse.json({ error: "That invite is already closed." }, { status: 404 });
    }
    const scope = await fleetScopeFor(auth);
    if (!scope.all) {
      const fleetIds = inviteFleetIds(invite.fleet_ids);
      if (
        invite.role === "owner" ||
        fleetIds.length === 0 ||
        fleetIds.some((fleetId) => !scope.fleetIds.includes(fleetId))
      ) {
        throw new AuthError("That invite is outside your fleets.", 403);
      }
    }
    const revoked = await revokeInvite(db, auth.orgId, id);
    if (!revoked) {
      return NextResponse.json({ error: "That invite is already closed." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "Could not revoke that invite.");
  }
}
