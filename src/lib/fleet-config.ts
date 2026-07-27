import { FleetType, MaintenanceIssue, normalizeFleetType } from "./types";

export interface FleetTypeConfig {
  requiresTowEquipmentCheck: boolean;
  extraPhotoPrompts: string[];
  maintenancePriority: MaintenanceIssue[];
  checkIntervalHours: number;
}

export const FLEET_TYPE_CONFIG: Record<FleetType, FleetTypeConfig> = {
  taxi: {
    requiresTowEquipmentCheck: false,
    extraPhotoPrompts: ["Interior cleanliness", "Meter display"],
    maintenancePriority: ["brakes", "ac", "dashboard_light"],
    checkIntervalHours: 12,
  },
  tow: {
    requiresTowEquipmentCheck: true,
    extraPhotoPrompts: ["Winch and chains", "Light bar"],
    maintenancePriority: ["brakes", "noise", "low_tire"],
    checkIntervalHours: 8,
  },
  turo: {
    requiresTowEquipmentCheck: false,
    extraPhotoPrompts: ["Interior front seats", "Trunk area"],
    maintenancePriority: ["ac", "dashboard_light", "low_tire"],
    checkIntervalHours: 24,
  },
  service_vehicle: {
    requiresTowEquipmentCheck: false,
    extraPhotoPrompts: [
      "Tool storage",
      "Equipment rack",
      "Camera mount",
      "Dashboard electronics",
    ],
    maintenancePriority: ["brakes", "noise", "dashboard_light"],
    checkIntervalHours: 12,
  },
};

export function getFleetConfig(type: string): FleetTypeConfig {
  return FLEET_TYPE_CONFIG[normalizeFleetType(type)];
}

export function canOverride(role: string): boolean {
  return role === "super_admin";
}

const FLEET_STATUS_ROLES = new Set([
  "super_admin",
  "tech",
  "management",
]);

/** Tech, Management, and Super Admin — fleet overview & status changes. */
export function canViewFleetOverview(role: string): boolean {
  return FLEET_STATUS_ROLES.has(role);
}

export function canUpdateStatus(role: string): boolean {
  return FLEET_STATUS_ROLES.has(role);
}

export function canViewReports(role: string): boolean {
  return role === "super_admin" || role === "management";
}

export function canPerformCheckIn(role: string): boolean {
  return role === "driver" || role === "super_admin";
}

export function canManageKnownIssues(role: string): boolean {
  return role === "super_admin" || role === "tech" || role === "management";
}

export function canManageFleet(role: string): boolean {
  return role === "super_admin";
}

export function canViewAlerts(role: string): boolean {
  return role === "super_admin" || role === "management" || role === "tech";
}

export function canManageAlertSettings(role: string): boolean {
  return role === "super_admin" || role === "management" || role === "tech";
}

export function canManageVehicleMaintenance(role: string): boolean {
  return role === "super_admin" || role === "tech" || role === "management";
}

export function canViewVehicleHistory(role: string): boolean {
  return role === "super_admin" || role === "tech" || role === "management";
}

export function canExportHistory(role: string): boolean {
  return role === "super_admin" || role === "management";
}
