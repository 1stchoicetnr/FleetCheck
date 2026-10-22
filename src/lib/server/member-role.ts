export type MemberRole = "driver" | "office" | "manager" | "owner";

export const CARRY_OVER_USER_IDS = new Set([
  "user-ashley",
  "user-james",
  "user-office",
  "user-tech",
  "user-driver",
]);

/** Map today's people onto memberships. Names win over the old role button. */
export function membershipRoleForLegacy(name: string, role: string): MemberRole {
  const n = name.trim().toLowerCase();
  if (n === "ashley" || n === "james") return "owner";
  if (n === "office" || n === "tech") return "office";
  if (n === "driver") return "driver";
  if (role === "super_admin") return "owner";
  if (role === "management" || role === "tech") return "office";
  return "driver";
}

export function memberRoleTitle(role: MemberRole): string {
  if (role === "owner") return "Owner";
  if (role === "manager") return "Manager";
  if (role === "office") return "Office";
  return "Driver";
}

/** Existing screens still understand the old role names. Manager shares Office's legacy role. */
export function legacyRoleForMember(role: MemberRole): "super_admin" | "management" | "driver" {
  if (role === "owner") return "super_admin";
  if (role === "office" || role === "manager") return "management";
  return "driver";
}

export function isMemberRole(value: string): value is MemberRole {
  return value === "driver" || value === "office" || value === "manager" || value === "owner";
}
