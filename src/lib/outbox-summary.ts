import type { CheckoutOutboxItem } from "./checkout-idempotency";
import { isPhotoWindowClosedError } from "./photo-window";

export type OutboxProblemKind = "waiting" | "sign-in" | "office" | "error";

export interface OutboxLine {
  id: string;
  unit: string;
  driver: string;
  /** When the check was saved on this phone, Pacific time. */
  when: string;
  problem: string;
  kind: OutboxProblemKind;
  /** Office, Manager and Owner may clear a stuck check from this phone. */
  canClear: boolean;
}

/** Office, Manager and Owner accounts (client roles). */
export function isOfficeRole(role: string | null | undefined): boolean {
  return role === "management" || role === "super_admin";
}

function isSignedOutFailure(item: CheckoutOutboxItem): boolean {
  return item.lastStatus === 401 || /sign in/i.test(item.lastError ?? "");
}

/** Plain words for why one check is still on this phone. */
export function outboxProblem(
  item: CheckoutOutboxItem,
  signedIn: boolean
): { kind: OutboxProblemKind; text: string } {
  if (!signedIn || isSignedOutFailure(item)) {
    return { kind: "sign-in", text: "Sign in to finish uploading." };
  }
  const message = item.lastError ?? "";
  if (!message) return { kind: "waiting", text: "Waiting to upload." };
  if (isPhotoWindowClosedError(message)) {
    return {
      kind: "office",
      text: "Photo window closed (6 hours). Tap Retry to send it without photos, or ask the office.",
    };
  }
  if (/only (send|add photos to) your own/i.test(message)) {
    return {
      kind: "office",
      text: "This check is under another driver. The office can sign in here to finish or clear it.",
    };
  }
  if (item.lastStatus && item.lastStatus >= 500) {
    return { kind: "error", text: `Server problem: ${message}. This phone will keep trying.` };
  }
  if (/needs its photos/i.test(message)) {
    return { kind: "waiting", text: "Photos are still saving. This phone will keep trying." };
  }
  return { kind: item.permanent ? "office" : "error", text: message };
}

export function formatOutboxWhen(iso: string | undefined): string {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "unknown date";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(t));
}

function photoTime(item: CheckoutOutboxItem): string | undefined {
  return item.signedAt || item.photos[0]?.capturedAt || item.createdAt;
}

export function outboxLines(
  items: CheckoutOutboxItem[],
  viewer: { signedIn: boolean; role?: string | null }
): OutboxLine[] {
  const office = viewer.signedIn && isOfficeRole(viewer.role);
  return [...items]
    .sort((a, b) => (photoTime(a) ?? "").localeCompare(photoTime(b) ?? ""))
    .map((item) => {
      const problem = outboxProblem(item, viewer.signedIn);
      return {
        id: item.id,
        unit: item.unitNumber ? `Unit ${item.unitNumber.startsWith("#") ? item.unitNumber : `#${item.unitNumber}`}` : "Unknown unit",
        driver: item.driverName || "Unknown driver",
        when: formatOutboxWhen(photoTime(item)),
        problem: problem.text,
        kind: problem.kind,
        canClear: office,
      };
    });
}

/** The banner headline: sign-in first, otherwise the usual message. */
export function outboxHeadline(lines: OutboxLine[], online: boolean): string {
  if (lines.some((line) => line.kind === "sign-in")) return "Sign in to finish uploading.";
  if (!online) return "This check didn't finish uploading. It stays on this phone until there is a signal.";
  return lines.length > 1
    ? `${lines.length} checks didn't finish uploading. They are still on this phone.`
    : "This check didn't finish uploading. It is still on this phone.";
}
