import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { AuthError, issueLink } from "@/lib/server/auth-accounts";
import { memberRoleForUser } from "@/lib/server/auth-store";
import { inviteQr, publicOrigin } from "@/lib/server/auth-http";
import { sendAccountMail, setupEmailText } from "@/lib/server/account-mail";
import { isMemberRole, membershipRoleForLegacy, type MemberRole } from "@/lib/server/member-role";
import { fleetScopeFor } from "@/lib/server/fleet-scope";
import { ensureMembership, getUser, listUserFleetIds } from "@/lib/server/org-data";
import { managerCanSeePerson } from "@/lib/role-access";
import { assertPeopleAccess, openAuthDb } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await assertPeopleAccess(req);
    const body = (await req.json().catch(() => ({}))) as { userId?: unknown };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) throw new AuthError("Choose a person.", 400);
    const db = await openAuthDb();
    const user = await getUser(db, auth.orgId, userId);
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let role = await memberRoleForUser(db, auth.orgId, userId);
    if (!isMemberRole(role || "")) {
      role = membershipRoleForLegacy(String(user.name), String(user.role));
      await ensureMembership(db, auth.orgId, {
        id: `member-${userId}`,
        userId,
        role,
        createdAt: new Date().toISOString(),
      });
    }
    const memberRole = role as MemberRole;
    const scope = await fleetScopeFor(auth);
    if (!scope.all) {
      const fleetIds = await listUserFleetIds(db, auth.orgId, userId);
      if (!managerCanSeePerson(memberRole, fleetIds, scope.fleetIds)) {
        throw new AuthError("That person is outside your fleets.", 403);
      }
    }
    const link = await issueLink(db, {
      orgId: auth.orgId,
      kind: "setup",
      role: memberRole,
      userId,
      email: String(user.email),
      name: String(user.name),
    });
    const url = `${publicOrigin(req)}/setup/${link.token}`;
    const qr = await inviteQr(url);
    const mailed = await sendAccountMail({
      to: String(user.email),
      subject: "Choose a new Inspekt password",
      text: setupEmailText({ name: String(user.name), url, kind: "setup" }),
    });
    return NextResponse.json(
      {
        id: link.id,
        url,
        qr,
        expiresAt: link.expiresAt,
        email: String(user.email),
        name: String(user.name),
        emailed: mailed.emailed,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not create a setup link.");
  }
}
