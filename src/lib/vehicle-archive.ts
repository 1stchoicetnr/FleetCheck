export const VEHICLE_ARCHIVED_MESSAGE =
  "This unit is archived / out of service. Ask Office to unarchive it.";

export function isVehicleArchived(vehicle: {
  archivedAt?: string | null;
}): boolean {
  return Boolean(vehicle.archivedAt);
}

export function parseIncludeArchived(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
