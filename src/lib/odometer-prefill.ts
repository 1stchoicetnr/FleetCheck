/** A new check starts blank. The last reading is only used for the warning. */
export function odometerPrefill(_lastMileage?: number | null): string {
  return "";
}

/** Warn when the fresh reading is below the last one, or more than 1,000 miles above it. */
export function odometerWarning(
  entered: number,
  lastMileage: number | null | undefined
): string | null {
  if (!Number.isFinite(entered) || lastMileage == null || !Number.isFinite(lastMileage)) {
    return null;
  }
  const last = Math.round(lastMileage).toLocaleString("en-US");
  if (entered < lastMileage) {
    return `That's lower than the last reading (${last}). Check the dash before you continue.`;
  }
  if (entered > lastMileage + 1000) {
    return `That's more than 1,000 miles above the last reading (${last}). Check the dash before you continue.`;
  }
  return null;
}
