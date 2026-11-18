import { isGenericDriverName } from "./driver-name";
import { sameDriverName } from "./photo-url";

/** A queued check can be sent days later. Older capture times are not trusted. */
export const QUEUED_CAPTURE_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * The time the driver actually did the check, for a check that sat on a phone.
 * Returns undefined when the value is missing, in the future or too old, so the
 * server time is used instead.
 */
export function queuedCaptureTime(capturedAt: unknown, now = Date.now()): string | undefined {
  if (typeof capturedAt !== "string") return undefined;
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) return undefined;
  if (t > now + CLOCK_SKEW_MS || now - t > QUEUED_CAPTURE_MAX_AGE_MS) return undefined;
  return new Date(t).toISOString();
}

export type QueuedDriverDecision =
  | { ok: true; driverName: string; driverUserId?: string; kept: boolean }
  | { ok: false; message: string };

/**
 * Who a check is filed under when it is finally sent from a phone.
 * - Same person (or no original recorded): the signed-in person, as before.
 * - Office, Manager or Owner sending someone else's queued check: the original driver stays.
 * - A different driver: refused, so a shared phone never files a check under the wrong name.
 */
export function resolveQueuedDriver(input: {
  signer: { userId: string; name: string; office: boolean };
  original: { userId?: string | null; name?: string | null };
  /** The original driver's account, looked up by id. */
  originalUser?: { id: string; name: string } | null;
}): QueuedDriverDecision {
  const { signer, original, originalUser } = input;
  const signerResult = { ok: true as const, driverName: signer.name, driverUserId: signer.userId, kept: false };
  const originalId = original.userId?.trim() || "";
  const originalName = originalUser?.name?.trim() || original.name?.trim() || "";
  if (originalId) {
    if (originalId === signer.userId) return signerResult;
  } else if (!originalName || isGenericDriverName(originalName) || sameDriverName(originalName, signer.name)) {
    return signerResult;
  }
  if (!originalName || isGenericDriverName(originalName)) {
    // Account known but no usable name: only office may send it, under the signer.
    if (signer.office) return signerResult;
    return {
      ok: false,
      message: "This check was started on another account. Ask the office to sign in on this phone to send it.",
    };
  }
  if (signer.office) {
    return {
      ok: true,
      driverName: originalName,
      driverUserId: originalUser?.id || (originalId || undefined),
      kept: true,
    };
  }
  return {
    ok: false,
    message: `This check was started by ${originalName}. ${originalName} or the office must sign in on this phone to send it.`,
  };
}
