/** Office-set Out of Service: blocks new check-outs until a Manager/Owner sets the unit back to Ready. */

export const OUT_OF_SERVICE_MESSAGE = "This unit is out of service. See the office.";
const REASON_MAX = 300;

export interface VehicleOutOfService {
  since: string;
  by: string;
  reason?: string;
}

type Role = string | null | undefined;

/** Office, Manager, Owner (and the office PIN) may take a unit out of service. */
export function canSetOutOfService(role: Role): boolean {
  return role === "office" || role === "manager" || role === "owner";
}

/** Only Manager or Owner may put it back to Ready. */
export function canReturnToReady(role: Role): boolean {
  return role === "manager" || role === "owner";
}

export function parseOutOfService(value: unknown): VehicleOutOfService | undefined {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  if (typeof v.since !== "string" || Number.isNaN(Date.parse(v.since))) return undefined;
  return {
    since: new Date(v.since).toISOString(),
    by: typeof v.by === "string" && v.by.trim() ? v.by.trim().slice(0, 120) : "Office",
    ...(typeof v.reason === "string" && v.reason.trim()
      ? { reason: v.reason.trim().replace(/\s+/g, " ").slice(0, REASON_MAX) }
      : {}),
  };
}

/** Body `{ outOfService: true, reason? }` or `{ outOfService: false }`. */
export function cleanOutOfServiceInput(
  body: unknown
): { outOfService: boolean; reason?: string } | { error: string } | null {
  if (!body || typeof body !== "object" || !("outOfService" in body)) return null;
  const b = body as { outOfService?: unknown; reason?: unknown };
  if (typeof b.outOfService !== "boolean") return { error: "outOfService must be true or false." };
  if (!b.outOfService) return { outOfService: false };
  const reason = typeof b.reason === "string" ? b.reason.trim().replace(/\s+/g, " ").slice(0, REASON_MAX) : "";
  return reason ? { outOfService: true, reason } : { outOfService: true };
}

/**
 * Block a new check-out on an out-of-service unit. A check captured before the
 * unit went out of service (sat in a phone's outbox) still goes through.
 */
export function blocksCheckout(
  outOfService: VehicleOutOfService | undefined,
  type: string | undefined,
  capturedAt: string | undefined
): boolean {
  if (!outOfService) return false;
  if (type === "check_in") return false;
  const captured = capturedAt ? Date.parse(capturedAt) : NaN;
  if (!Number.isNaN(captured) && captured < Date.parse(outOfService.since)) return false;
  return true;
}
