import { AuthError } from "./auth-accounts";
import { deleteUserSessions, memberRoleForUser } from "./auth-store";
import { isMemberRole, legacyRoleForMember, type MemberRole } from "./member-role";
import {
  getFleet,
  getUser,
  listActiveOwnerIds,
  listUserFleetIds,
  replaceUserFleets,
  setMembershipRole,
  setUserActive,
  setUserLegacyRole,
} from "./org-data";
import type { OrgDb } from "./org-data";
import { canGrantMemberRole, fleetsStayInside, managerCanSeePerson } from "../role-access";

export const LAST_OWNER_MESSAGE = "The company needs at least one active Owner.";

/** Block a change that would leave the company with no active Owner. */
export async function assertActiveOwnerRemains(
  db: OrgDb,
  orgId: string,
  userId: string,
  next: { role?: string; active?: boolean }
): Promise<void> {
  const user = await getUser(db, orgId, userId);
  if (!user) return;
  const currentRole = (await memberRoleForUser(db, orgId, userId)) || "";
  const activeNow =
    currentRole === "owner" &&
    Boolean(user.active) &&
    String(user.access_status || "active") === "active";
  if (!activeNow) return;
  const nextRole = next.role ?? "owner";
  const nextActive = next.active ?? true;
  if (nextRole === "owner" && nextActive) return;
  const owners = await listActiveOwnerIds(db, orgId);
  if (!owners.some((id) => id !== userId)) {
    throw new AuthError(LAST_OWNER_MESSAGE, 409);
  }
}

export async function updatePersonAccess(
  db: OrgDb,
  input: {
    orgId: string;
    userId: string;
    actorRole: MemberRole;
    actorFleetIds: string[] | null;
    role?: string;
    active?: boolean;
    fleetIds?: string[];
  }
): Promise<void> {
  if (input.actorRole !== "owner" && input.actorRole !== "manager") {
    throw new AuthError("Manager access is required.", 403);
  }
  const user = await getUser(db, input.orgId, input.userId);
  if (!user || String(user.access_status || "active") === "pending") {
    throw new AuthError("Not found", 404);
  }
  const currentRole = (await memberRoleForUser(db, input.orgId, input.userId)) || "";
  if (currentRole === "owner" && input.actorRole !== "owner") {
    throw new AuthError("Owners are outside a manager's fleets.", 403);
  }
  const currentFleets = await listUserFleetIds(db, input.orgId, input.userId);
  const actorFleets = input.actorFleetIds;
  const visible =
    input.actorRole === "owner" ||
    (actorFleets !== null && managerCanSeePerson(currentRole, currentFleets, actorFleets));
  const claimingUnassigned =
    input.actorRole === "manager" &&
    currentFleets.length === 0 &&
    currentRole !== "owner" &&
    Array.isArray(input.fleetIds) &&
    fleetsStayInside(actorFleets, input.fleetIds);
  if (!visible && !claimingUnassigned) {
    throw new AuthError("That person is outside your fleets.", 403);
  }
  if (input.role !== undefined) {
    if (!isMemberRole(input.role)) throw new AuthError("Choose a role.", 400);
    if (!canGrantMemberRole(input.actorRole, input.role)) {
      throw new AuthError("Only an owner can grant Owner.", 403);
    }
  }
  await assertActiveOwnerRemains(db, input.orgId, input.userId, {
    role: input.role,
    active: input.active,
  });
  if (input.role !== undefined) {
    await setMembershipRole(db, input.orgId, {
      id: `member-${input.userId}`,
      userId: input.userId,
      role: input.role,
      createdAt: new Date().toISOString(),
    });
    await setUserLegacyRole(db, input.orgId, input.userId, legacyRoleForMember(input.role));
    await deleteUserSessions(db, input.orgId, input.userId);
  }
  if (typeof input.active === "boolean") {
    const saved = await setUserActive(db, input.orgId, input.userId, input.active);
    if (!saved) throw new AuthError("Not found", 404);
    if (!input.active) await deleteUserSessions(db, input.orgId, input.userId);
  }
  if (input.fleetIds) {
    const fleetIds = [...new Set(input.fleetIds.map((id) => id.trim()).filter(Boolean))];
    if (fleetIds.length < 1 || fleetIds.length > 20) {
      throw new AuthError("Choose at least one fleet.", 400);
    }
    if (!fleetsStayInside(input.actorFleetIds, fleetIds)) {
      throw new AuthError("Choose fleets inside your own fleets.", 403);
    }
    if (
      input.actorRole === "manager" &&
      input.actorFleetIds &&
      currentFleets.some((id) => !input.actorFleetIds?.includes(id))
    ) {
      throw new AuthError("That person is outside your fleets.", 403);
    }
    for (const fleetId of fleetIds) {
      const fleet = await getFleet(db, input.orgId, fleetId);
      if (!fleet || fleet.archived_at) throw new AuthError("Choose a fleet in this company.", 400);
    }
    await replaceUserFleets(db, input.orgId, input.userId, fleetIds);
  }
}
