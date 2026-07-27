import { Vehicle } from "./types";

export const OIL_CHANGE_INTERVAL_MI = 5000;
export const OIL_CHANGE_WARNING_MI = 500;

export type OilChangeStatus = "ok" | "due_soon" | "overdue" | "unknown";

export function getOilChangeStatus(
  vehicle: Vehicle,
  currentMileage: number
): OilChangeStatus {
  if (vehicle.lastOilChangeMileage == null) return "unknown";
  const milesSince = currentMileage - vehicle.lastOilChangeMileage;
  if (milesSince > OIL_CHANGE_INTERVAL_MI) return "overdue";
  if (milesSince > OIL_CHANGE_INTERVAL_MI - OIL_CHANGE_WARNING_MI) {
    return "due_soon";
  }
  return "ok";
}

export function milesSinceOilChange(
  vehicle: Vehicle,
  currentMileage: number
): number | null {
  if (vehicle.lastOilChangeMileage == null) return null;
  return currentMileage - vehicle.lastOilChangeMileage;
}

export function oilChangeStatusLabel(status: OilChangeStatus): string {
  switch (status) {
    case "overdue":
      return "Overdue for oil change";
    case "due_soon":
      return "Oil change due soon (within 500 miles)";
    case "unknown":
      return "Last oil change mileage not set";
    default:
      return "Oil change OK";
  }
}

export const CHECK_OUT_BLOCKED_OOS =
  "This vehicle is Out of Service and cannot be checked out.";

export const CHECK_OUT_BLOCKED_OIL =
  "This vehicle is overdue for an oil change and cannot be checked out.";

export function getCheckOutBlockReason(
  vehicle: Vehicle,
  currentMileage: number
): string | null {
  if (vehicle.status === "out_of_service") {
    return CHECK_OUT_BLOCKED_OOS;
  }
  const oil = getOilChangeStatus(vehicle, currentMileage);
  if (oil === "overdue") {
    return CHECK_OUT_BLOCKED_OIL;
  }
  return null;
}

export function getCheckOutOilWarning(
  vehicle: Vehicle,
  currentMileage: number
): string | null {
  if (getCheckOutBlockReason(vehicle, currentMileage)) return null;
  if (getOilChangeStatus(vehicle, currentMileage) === "due_soon") {
    return "Oil change due soon (within 500 miles).";
  }
  return null;
}

/** Mileage to use before driver enters odometer on check-out lookup */
export function estimateCheckOutMileage(vehicle: Vehicle): number {
  return vehicle.lastMileage ?? 0;
}
