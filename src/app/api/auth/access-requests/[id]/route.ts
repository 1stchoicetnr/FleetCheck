import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { AuthError, issueLink } from "@/lib/server/auth-accounts";
import { reviewAccessRequest } from "@/lib/server/access-requests";
import { approvedEmailText, sendAccountMail, setupEmailText } from "@/lib/server/account-mail";
import { inviteQr, publicOrigin } from "@/lib/server/auth-http";
import { isMemberRole, type MemberRole } from "@/lib/server/member-role";
import { fleetScopeFor } from "@/lib/server/fleet-scope";
import { getUser } from "@/lib/server/org-data";
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
    const role = typeof body.role === "string" ? body.role : "";
    await reviewAccessRequest(db, {
      orgId: auth.orgId,
      userId: id,
      action,
      role,
      fleetIds,
      actorRole: auth.role,
      actorFleetIds: scope.all ? null : scope.fleetIds,
    });
    if (action === "deny") {
      return NextResponse.json({ ok: true, emailed: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const user = await getUser(db, auth.orgId, id);
    if (!user) {
      return NextResponse.json({ ok: true, emailed: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const origin = publicOrigin(req);
    if (user.password_hash) {
      const mailed = await sendAccountMail({
        to: String(user.email),
        subject: "You're approved on Inspekt",
        text: approvedEmailText({
          name: String(user.name),
          signInUrl: `${origin}/`,
        }),
      });
      return NextResponse.json(
        { ok: true, emailed: mailed.emailed },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const memberRole = (isMemberRole(role) ? role : "driver") as MemberRole;
    const link = await issueLink(db, {
      orgId: auth.orgId,
      kind: "setup",
      role: memberRole,
      userId: id,
      email: String(user.email),
      name: String(user.name),
    });
    const url = `${origin}/setup/${link.token}`;
    const mailed = await sendAccountMail({
      to: String(user.email),
      subject: "Set up your Inspekt sign-in",
      text: setupEmailText({ name: String(user.name), url, kind: "setup" }),
    });
    return NextResponse.json(
      {
        ok: true,
        emailed: mailed.emailed,
        url,
        qr: await inviteQr(url),
        expiresAt: link.expiresAt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not update that request.");
  }
}
