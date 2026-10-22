import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/server/api-error";
import { listInvites } from "@/lib/server/auth-store";
import { isMemberRole, memberRoleTitle } from "@/lib/server/member-role";
import { listPeople } from "@/lib/server/org-data";
import { fleetScopeFor } from "@/lib/server/fleet-scope";
import { listUserFleetRows } from "@/lib/server/org-data";
import { managerCanSeePerson } from "@/lib/role-access";
import { assertPeopleAccess, openAuthDb } from "@/lib/server/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export async function GET(req: Request) {
  try {
    const auth = await assertPeopleAccess(req);
    const db = await openAuthDb();
    const scope = await fleetScopeFor(auth);
    const [people, invites, fleetRows] = await Promise.all([
      listPeople(db, auth.orgId),
      listInvites(db, auth.orgId),
      listUserFleetRows(db, auth.orgId),
    ]);
    const fleetsByUser = new Map<string, string[]>();
    for (const row of fleetRows) {
      const userId = String(row.user_id);
      const list = fleetsByUser.get(userId) || [];
      list.push(String(row.fleet_id));
      fleetsByUser.set(userId, list);
    }
    return NextResponse.json(
      {
        people: people.flatMap((row) => {
          const role = isMemberRole(String(row.member_role || ""))
            ? String(row.member_role)
            : "";
          const fleetIds = fleetsByUser.get(String(row.id)) || [];
          if (
            !scope.all &&
            !managerCanSeePerson(role, fleetIds, scope.fleetIds)
          ) {
            return [];
          }
          return [{
            id: String(row.id),
            name: String(row.name),
            email: String(row.email),
            active: asBool(row.active),
            role,
            roleTitle: isMemberRole(role) ? memberRoleTitle(role) : "",
            hasPassword: asBool(row.has_password),
            fleetIds,
          }];
        }),
        invites: invites.flatMap((row) => {
          const role = String(row.role);
          const fleetIds = String(row.fleet_ids || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
          if (!scope.all) {
            if (role === "owner") return [];
            if (fleetIds.length === 0 || fleetIds.some((id) => !scope.fleetIds.includes(id))) {
              return [];
            }
          }
          return [{
            id: String(row.id),
            kind: String(row.kind),
            userId: row.user_id ? String(row.user_id) : null,
            email: row.email ? String(row.email) : null,
            name: row.name ? String(row.name) : null,
            role,
            roleTitle: isMemberRole(role) ? memberRoleTitle(role) : "",
            fleetIds,
            expiresAt: new Date(row.expires_at as string).toISOString(),
            revokedAt: row.revoked_at ? new Date(row.revoked_at as string).toISOString() : null,
            usedAt: row.used_at ? new Date(row.used_at as string).toISOString() : null,
          }];
        }),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return errorResponse(err, "Could not load people.");
  }
}
