import {
  Vehicle,
  VehicleStatus,
  CheckType,
  MaintenanceIssue,
  ConditionRating,
} from "./types";

/** All mutually exclusive vehicle statuses (one badge per vehicle). */
export const VEHICLE_STATUSES: VehicleStatus[] = [
  "ready",
  "checked_out",
  "needs_work",
  "out_of_service",
];

/** Statuses tech/management can set manually (Checked Out is set by check-out only). */
export const MANUAL_VEHICLE_STATUSES = [
  "ready",
  "needs_work",
  "out_of_service",
] as const;

function hasMajorProblems(
  issues: MaintenanceIssue[],
  condition: ConditionRating
): boolean {
  return issues.length > 0 || condition === "poor";
}

export function resolveStatusAfterCheck(
  vehicle: Vehicle,
  checkType: CheckType,
  issues: MaintenanceIssue[],
  condition: ConditionRating
): VehicleStatus {
  const majorProblems = hasMajorProblems(issues, condition);

  if (checkType === "check_out") {
    return majorProblems ? "needs_work" : "checked_out";
  }

  // check_in
  if (vehicle.status === "out_of_service") {
    return "out_of_service";
  }
  if (majorProblems) {
    return "needs_work";
  }
  return "ready";
}
