import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { AuthError, issueLink } from "@/lib/server/auth-accounts";
import { inviteQr, publicOrigin } from "@/lib/server/auth-http";
import { sendAccountMail, setupEmailText } from "@/lib/server/account-mail";
import { isMemberRole, type MemberRole } from "@/lib/server/member-role";
import { fleetScopeFor } from "@/lib/server/fleet-scope";
import { findUserByEmail, getFleet } from "@/lib/server/org-data";
import { assertPeopleAccess, openAuthDb } from "@/lib/server/request-auth";
import { canGrantMemberRole, fleetsStayInside } from "@/lib/role-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await assertPeopleAccess(req);
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      email?: unknown;
      role?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role: MemberRole = isMemberRole(String(body.role || "")) ? (body.role as MemberRole) : "driver";
    if (!auth.role || !canGrantMemberRole(auth.role, role)) {
      throw new AuthError("Only an owner can grant Owner.", 403);
    }
    const fleetIds = [
      ...new Set(
        (Array.isArray((body as { fleetIds?: unknown }).fleetIds)
          ? (body as { fleetIds: unknown[] }).fleetIds
          : []
        )
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      ),
    ];
    const scope = await fleetScopeFor(auth);
    if (!scope.all && (fleetIds.length < 1 || !fleetsStayInside(scope.fleetIds, fleetIds))) {
      throw new AuthError("Choose fleets inside your own fleets.", 403);
    }
    if (name.length < 1 || name.length > 80) {
      throw new AuthError("Enter a name.", 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      throw new AuthError("Enter a valid email.", 400);
    }
    const db = await openAuthDb();
    for (const fleetId of fleetIds) {
      const fleet = await getFleet(db, auth.orgId, fleetId);
      if (!fleet || fleet.archived_at) throw new AuthError("Choose a fleet in this company.", 400);
    }
    const taken = await findUserByEmail(db, auth.orgId, email);
    if (taken) {
      throw new AuthError("That email already has an account. Ask for a setup link.", 409);
    }
    const link = await issueLink(db, {
      orgId: auth.orgId,
      kind: "invite",
      role,
      email,
      name,
      fleetIds,
    });
    const url = `${publicOrigin(req)}/setup/${link.token}`;
    const qr = await inviteQr(url);
    const mailed = await sendAccountMail({
      to: email,
      subject: "Set up your Inspekt sign-in",
      text: setupEmailText({ name, url, kind: "invite" }),
    });
    return NextResponse.json(
      { id: link.id, url, qr, expiresAt: link.expiresAt, role, emailed: mailed.emailed },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not create that invite.");
  }
}
