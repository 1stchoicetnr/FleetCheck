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
  return role === "super_admin" || role === "management" || role === "tech";
}

export function canSeeAlerts(role: string): boolean {
  return role === "super_admin" || role === "management" || role === "tech";
}

export function canEditNotifications(role: string): boolean {
  return canSeeAlerts(role);
}

export function canEditCompany(user: MenuUser): boolean {
  return (
    user.role === "super_admin" ||
    user.role === "management" ||
    user.roleTitle === "Owner" ||
    canReviewOffice(user.role)
  );
}

export function canEditPeople(role: string): boolean {
  return role === "super_admin";
}

export function canAddVehicle(role: string): boolean {
  return role === "super_admin";
}

/** Office and Owner edit fleets. Tech can open Settings and only sees the list. */
export function canEditFleets(user: MenuUser): boolean {
  return (
    user.role === "super_admin" ||
    user.role === "management" ||
    user.roleTitle === "Owner" ||
    user.roleTitle === "Office"
  );
}

/** Daily actions first, then the combined vehicles and settings tiles. */
export function homeTiles(user: MenuUser): HomeTileId[] {
  const tiles: HomeTileId[] = ["my-checks"];
  if (canReviewOffice(user.role)) tiles.push("office", "alerts");
  tiles.push("vehicles");
  if (settingsSections(user).length > 0) tiles.push("settings");
  if (user.role === "tech") tiles.push("reports");
  return tiles;
}

export function settingsSections(user: MenuUser): SettingsSectionId[] {
  const sections: SettingsSectionId[] = [];
  if (canEditCompany(user)) sections.push("company");
  if (canEditNotifications(user.role)) sections.push("notifications");
  if (canEditPeople(user.role)) sections.push("people");
  return sections;
}
