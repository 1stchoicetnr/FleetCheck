import { formatCheckoutTime } from "./checkout-slack";
import type { CheckRecord } from "./types";

export interface LastCheckInfo {
  lastCheckAt: string;
  driverName: string;
  checkType: CheckRecord["type"];
}

/** Latest completed check per vehicle (for display only — not a separate status). */
export function buildLastCheckMap(
  checks: CheckRecord[]
): Map<string, LastCheckInfo> {
  const sorted = [...checks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const map = new Map<string, LastCheckInfo>();

  for (const check of sorted) {
    if (check.archivedAt) continue;
    if (map.has(check.vehicleId)) continue;
    map.set(check.vehicleId, {
      lastCheckAt: check.createdAt,
      driverName: check.driverName,
      checkType: check.type,
    });
  }

  return map;
}

export function getLastCheck(
  vehicleId: string,
  checks: CheckRecord[]
): LastCheckInfo | undefined {
  return buildLastCheckMap(checks).get(vehicleId);
}

export function formatLastCheckLine(info: LastCheckInfo): string {
  const action = info.checkType === "check_in" ? "check in" : "check out";
  return `Last ${action} by ${info.driverName} · ${formatCheckoutTime(info.lastCheckAt)}`;
}
