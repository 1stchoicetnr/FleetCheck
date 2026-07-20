import { FleetType } from "./types";

export interface FleetTypeConfig {
  requiresTowEquipmentCheck: boolean;
  extraPhotoPrompts: string[];
  maintenancePriority: string[];
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
    extraPhotoPrompts: ["Tool storage", "Equipment rack"],
    maintenancePriority: ["brakes", "noise", "dashboard_light"],
    checkIntervalHours: 12,
  },
  camera_car: {
    requiresTowEquipmentCheck: false,
    extraPhotoPrompts: ["Camera mount", "Dashboard electronics"],
    maintenancePriority: ["dashboard_light", "noise", "ac"],
    checkIntervalHours: 12,
  },
  other: {
    requiresTowEquipmentCheck: false,
    extraPhotoPrompts: [],
    maintenancePriority: ["brakes", "low_tire", "dashboard_light"],
    checkIntervalHours: 12,
  },
};

export function getFleetConfig(type: FleetType): FleetTypeConfig {
  return FLEET_TYPE_CONFIG[type];
}

export function canOverride(role: string): boolean {
  return role === "super_admin";
}

export function canUpdateStatus(role: string): boolean {
  return role === "super_admin" || role === "tech";
}

export function canViewReports(role: string): boolean {
  return role === "super_admin" || role === "management";
}

export function canManageFleet(role: string): boolean {
  return role === "super_admin";
}
