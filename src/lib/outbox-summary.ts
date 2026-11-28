import type { CheckoutOutboxItem } from "./checkout-idempotency";
import { isDriverFixableOutboxError, notSentValidationMessage } from "./checkout-missing";
import { previousDayOutboxMessage } from "./checkout-draft-day";
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
  /** Set when this check was signed on an earlier Pacific day and is still here. */
  previousDayNote?: string;
  /** Opens the check so the driver can fill in what the server refused. */
  fixHref?: string;
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
  const validation = notSentValidationMessage(message);
  if (validation) return { kind: "office", text: validation };
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
  viewer: { signedIn: boolean; role?: string | null },
  now: Date = new Date()
): OutboxLine[] {
  const office = viewer.signedIn && isOfficeRole(viewer.role);
  return [...items]
    .sort((a, b) => (photoTime(a) ?? "").localeCompare(photoTime(b) ?? ""))
    .map((item) => {
      const problem = outboxProblem(item, viewer.signedIn);
      const previousDayNote = previousDayOutboxMessage(item, now) ?? undefined;
      return {
        id: item.id,
        unit: item.unitNumber ? `Unit ${item.unitNumber.startsWith("#") ? item.unitNumber : `#${item.unitNumber}`}` : "Unknown unit",
        driver: item.driverName || "Unknown driver",
        when: formatOutboxWhen(photoTime(item)),
        problem: previousDayNote && problem.kind === "waiting" ? previousDayNote : problem.text,
        kind: problem.kind,
        canClear: office,
        previousDayNote,
        fixHref: isDriverFixableOutboxError(item.lastError) ? `/checkout/${item.draftId}` : undefined,
      };
    });
}

/** The banner headline: sign-in first, otherwise the usual message. */
export function outboxHeadline(lines: OutboxLine[], online: boolean): string {
  if (lines.some((line) => line.kind === "sign-in")) return "Sign in to finish uploading.";
  if (!online) return "This check didn't finish uploading. It stays on this phone until there is a signal.";
  const notes = lines
    .map((line) => line.previousDayNote)
    .filter((note): note is string => Boolean(note));
  if (notes.length > 0 && notes.length === lines.length) return notes.join(" ");
  return lines.length > 1
    ? `${lines.length} checks didn't finish uploading. They are still on this phone.`
    : "This check didn't finish uploading. It is still on this phone.";
}
