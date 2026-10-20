import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { AuthError, issueLink } from "@/lib/server/auth-accounts";
import { inviteQr, publicOrigin } from "@/lib/server/auth-http";
import { isMemberRole, type MemberRole } from "@/lib/server/member-role";
import { findUserByEmail } from "@/lib/server/org-data";
import { assertOwnerAccess, openAuthDb } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await assertOwnerAccess(req);
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      email?: unknown;
      role?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role: MemberRole = isMemberRole(String(body.role || "")) ? (body.role as MemberRole) : "driver";
    if (name.length < 1 || name.length > 80) {
      throw new AuthError("Enter a name.", 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      throw new AuthError("Enter a valid email.", 400);
    }
    const db = await openAuthDb();
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
    });
    const url = `${publicOrigin(req)}/setup/${link.token}`;
    const qr = await inviteQr(url);
    return NextResponse.json(
      { id: link.id, url, qr, expiresAt: link.expiresAt, role },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not create that invite.");
  }
}
