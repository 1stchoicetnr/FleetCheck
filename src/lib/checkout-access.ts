import { sameDriverName } from "./photo-url";

/**
 * Office, Manager, and Owner may update any check.
 * The signed-in person who started it may.
 * A check saved before user ids existed still accepts that same driver by name,
 * so an in-flight upload can finish.
 */
export function mayUpdateCheckout(input: {
  office: boolean;
  userId?: string | null;
  userName?: string | null;
  driverUserId?: string | null;
  driverName?: string | null;
}): boolean {
  if (input.office) return true;
  if (input.driverUserId) return Boolean(input.userId) && input.userId === input.driverUserId;
  return sameDriverName(input.userName, input.driverName);
}

/** My checks: a stored user id wins. Older rows still match the signed-in name. */
export function reportBelongsToDriver(
  report: { driverUserId?: string | null; driverName?: string | null },
  driver: { userId?: string | null; name?: string | null }
): boolean {
  if (report.driverUserId) return Boolean(driver.userId) && report.driverUserId === driver.userId;
  return sameDriverName(report.driverName, driver.name);
}
