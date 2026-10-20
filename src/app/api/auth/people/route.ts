import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { listInvites } from "@/lib/server/auth-store";
import { isMemberRole, memberRoleTitle } from "@/lib/server/member-role";
import { listPeople } from "@/lib/server/org-data";
import { assertOwnerAccess, openAuthDb } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export async function GET(req: Request) {
  try {
    const auth = await assertOwnerAccess(req);
    const db = await openAuthDb();
    const [people, invites] = await Promise.all([
      listPeople(db, auth.orgId),
      listInvites(db, auth.orgId),
    ]);
    return NextResponse.json(
      {
        people: people.map((row) => {
          const role = isMemberRole(String(row.member_role || ""))
            ? String(row.member_role)
            : "";
          return {
            id: String(row.id),
            name: String(row.name),
            email: String(row.email),
            active: asBool(row.active),
            role,
            roleTitle: isMemberRole(role) ? memberRoleTitle(role) : "",
            hasPassword: asBool(row.has_password),
          };
        }),
        invites: invites.map((row) => {
          const role = String(row.role);
          return {
          id: String(row.id),
          kind: String(row.kind),
          userId: row.user_id ? String(row.user_id) : null,
          email: row.email ? String(row.email) : null,
          name: row.name ? String(row.name) : null,
          role,
          roleTitle: isMemberRole(role) ? memberRoleTitle(role) : "",
            expiresAt: new Date(row.expires_at as string).toISOString(),
          revokedAt: row.revoked_at ? new Date(row.revoked_at as string).toISOString() : null,
          usedAt: row.used_at ? new Date(row.used_at as string).toISOString() : null,
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not load people.");
  }
}
