/** Mileage to show when a unit is selected. Blank when that unit has no reading. */
export function odometerPrefill(lastMileage: number | null | undefined): string {
  if (lastMileage == null || !Number.isFinite(lastMileage)) return "";
  return String(lastMileage);
}
