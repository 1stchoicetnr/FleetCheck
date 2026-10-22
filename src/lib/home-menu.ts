import {
  accessRank,
  canEditCompanySettings,
  canEditFleetNotifications,
  canEditVehicles,
  canManagePeople,
  canReviewOfficeWork,
} from "./role-access";

export interface MenuUser {
  role: string;
  roleTitle?: string;
}

export type HomeTileId =
  | "my-checks"
  | "office"
  | "alerts"
  | "vehicles"
  | "settings"
  | "reports";

export type SettingsSectionId = "company" | "notifications" | "people";

export function canStartCheck(role: string): boolean {
  return role === "driver" || role === "super_admin" || role === "management";
}

export function canReviewOffice(role: string): boolean {
  return canReviewOfficeWork({ role });
}

export function canSeeAlerts(role: string): boolean {
  return canReviewOffice(role);
}

export function canEditNotifications(user: MenuUser): boolean {
  return canEditFleetNotifications(user);
}

export function canEditCompany(user: MenuUser): boolean {
  return canEditCompanySettings(user);
}

export function canEditPeople(user: MenuUser): boolean {
  return accessRank(user) === "owner";
}

/** Owner and Manager approve access requests. Office, Tech, and Driver do not. */
export function canReviewAccessRequests(user: MenuUser): boolean {
  return canManagePeople(user);
}

export function canAddVehicle(user: MenuUser): boolean {
  return canEditVehicles(user);
}

/** Owner edits every fleet. Manager edits assigned fleets. Office views only. */
export function canEditFleets(user: MenuUser): boolean {
  const rank = accessRank(user);
  return rank === "owner" || rank === "manager";
}

/** A menu count is shown only when there is something to do. */
export function visibleMenuBadge(count: number | null | undefined): number | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  return Math.trunc(count);
}

/** Daily actions first, then the combined vehicles and settings tiles. */
export function homeTiles(user: MenuUser): HomeTileId[] {
  const tiles: HomeTileId[] = ["my-checks"];
  if (canReviewOfficeWork(user)) tiles.push("office", "alerts");
  tiles.push("vehicles");
  if (settingsSections(user).length > 0) tiles.push("settings");
  if (user.role === "tech") tiles.push("reports");
  return tiles;
}

export function settingsSections(user: MenuUser): SettingsSectionId[] {
  const sections: SettingsSectionId[] = [];
  if (canEditCompany(user)) sections.push("company");
  if (canEditNotifications(user)) sections.push("notifications");
  if (canReviewAccessRequests(user)) sections.push("people");
  return sections;
}
