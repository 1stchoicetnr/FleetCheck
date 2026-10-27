import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { AuthError, reissueInvite } from "@/lib/server/auth-accounts";
import { sendAccountMail, setupEmailText } from "@/lib/server/account-mail";
import { inviteQr, publicOrigin } from "@/lib/server/auth-http";
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

export async function POST(
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
    const fresh = await reissueInvite(db, auth.orgId, id);
    if (!fresh) {
      return NextResponse.json({ error: "That invite is already closed." }, { status: 404 });
    }
    const url = `${publicOrigin(req)}/setup/${fresh.token}`;
    const emailed = fresh.email
      ? (
          await sendAccountMail({
            to: fresh.email,
            subject:
              fresh.kind === "invite"
                ? "Set up your Inspekt sign-in"
                : "Choose a new Inspekt password",
            text: setupEmailText({
              name: fresh.name || "there",
              url,
              kind: fresh.kind,
            }),
          })
        ).emailed
      : false;
    return NextResponse.json(
      {
        id: fresh.id,
        url,
        qr: await inviteQr(url),
        expiresAt: fresh.expiresAt,
        emailed,
        name: fresh.name,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not resend that invite.");
  }
}
