export const MEMBER_ROLE_ORDER = ["driver", "office", "manager", "owner"] as const;

export type AccessMemberRole = (typeof MEMBER_ROLE_ORDER)[number];

export interface AccessUser {
  role: string;
  roleTitle?: string | null;
}

export const ROLE_DETAILS: Record<AccessMemberRole, string> = {
  driver: "Runs checkout checks on assigned fleets.",
  office: "Reviews checks, handles damage alerts, and views vehicles on assigned fleets.",
  manager:
    "Everything Office can do, plus people, vehicles, and settings for assigned fleets only.",
  owner: "Every fleet, every person, and company-wide settings.",
};

export function roleChoices(includeOwner: boolean): AccessMemberRole[] {
  return includeOwner
    ? ["driver", "office", "manager", "owner"]
    : ["driver", "office", "manager"];
}

/** Membership rank. A Manager keeps the Office legacy role, so the title wins. */
export function accessRank(
  user: AccessUser
): AccessMemberRole | "tech" | "unknown" {
  const title = user.roleTitle || "";
  if (title === "Owner" || user.role === "owner") return "owner";
  if (title === "Manager" || user.role === "manager") return "manager";
  if (title === "Office" || user.role === "office") return "office";
  if (title === "Tech" || user.role === "tech") return "tech";
  if (title === "Driver" || user.role === "driver") return "driver";
  if (user.role === "super_admin") return "owner";
  if (user.role === "management") return "office";
  return "unknown";
}

export function canReviewOfficeWork(user: AccessUser): boolean {
  const rank = accessRank(user);
  return rank === "office" || rank === "manager" || rank === "owner" || rank === "tech";
}

export function canEditVehicles(user: AccessUser): boolean {
  const rank = accessRank(user);
  return rank === "manager" || rank === "owner";
}

export function canManagePeople(user: AccessUser): boolean {
  const rank = accessRank(user);
  return rank === "manager" || rank === "owner";
}

export function canEditCompanySettings(user: AccessUser): boolean {
  const rank = accessRank(user);
  return rank === "owner" || rank === "tech";
}

export function canEditFleetNotifications(user: AccessUser): boolean {
  const rank = accessRank(user);
  return rank === "manager" || rank === "owner" || rank === "tech";
}

export function canGrantMemberRole(
  actor: AccessMemberRole,
  target: AccessMemberRole
): boolean {
  if (actor === "owner") return true;
  if (actor === "manager") return target === "driver" || target === "office" || target === "manager";
  return false;
}

/** A manager only sees people whose fleets all sit inside the manager's fleets. */
export function managerCanSeePerson(
  targetRole: string,
  targetFleetIds: string[],
  actorFleetIds: string[]
): boolean {
  if (targetRole === "owner") return false;
  if (targetFleetIds.length === 0) return false;
  return targetFleetIds.every((id) => actorFleetIds.includes(id));
}

export function fleetsStayInside(actorFleetIds: string[] | null, requested: string[]): boolean {
  if (actorFleetIds === null) return true;
  return requested.every((id) => actorFleetIds.includes(id));
}
