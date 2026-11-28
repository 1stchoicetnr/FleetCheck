import { formatCheckoutTime } from "./checkout-slack";
import { formatUnitLabel } from "./utils";

/** Total webhook attempts, including the first try at mark-sent. */
export const SLACK_DELIVERY_CAP = 6;

/** Photos still missing after this, for a check the server already stored. */
export const STALL_PHOTOS_AFTER_MS = 10 * 60 * 1000;

/** Check stored, but never marked sent. */
export const STALL_UNFINISHED_AFTER_MS = 30 * 60 * 1000;

/** Older unsent checks are left alone so the first run does not backfill history. */
export const STALL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A "Not sent" stall notice is only for a recent check. A checkout that did
 * finish still posts after this, with a late-post label, for CHECKOUT_POST_MAX_AGE_MS.
 */
export const SLACK_AUTOPOST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Unattended checkout retries stop after this. Checks created before
 * CHECKOUT_SLACK_CUTOFF are not posted at all, whatever their age.
 */
export const CHECKOUT_POST_MAX_AGE_MS = 21 * 24 * 60 * 60 * 1000;

/**
 * Backlog cutoff. A checkout created before this is recorded as handled and
 * is not posted to Slack by the sweep, by mark-sent, or by the daily job.
 * 4:30 PM PT on Nov 27, 2026, which is already past. Every check created
 * after that posts normally, including ones submitted between now and deploy.
 * Only older stuck checks are recorded as handled and kept out of #radcabcr.
 * A check created after this still gets the late label when the post is more
 * than 15 minutes after the driver signed.
 */
export const CHECKOUT_SLACK_CUTOFF = "2026-11-28T00:30:00.000Z";

export const CHECKOUT_BEFORE_CUTOFF = "before slack cutoff";

export const STALL_REASON_PHOTOS = "Photos still uploading";
export const STALL_REASON_UNFINISHED = "Unfinished for 30 minutes";

const RETRY_DELAYS_MS = [
  2 * 60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
];

/** Delay before the next try after this many failed attempts. */
export function slackRetryDelayMs(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[index];
}

export function slackDeliveryExhausted(attempts: number): boolean {
  return attempts >= SLACK_DELIVERY_CAP;
}

/** True when a stall notice is too old for the daily job. */
export function slackAutopostTooOld(createdAt: string, now: number): boolean {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  return now - created > SLACK_AUTOPOST_MAX_AGE_MS;
}

/** True when this check was created before the backlog cutoff. A bad date counts as before it. */
export function checkoutCreatedBeforeSlackCutoff(createdAt: string): boolean {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return true;
  return created < Date.parse(CHECKOUT_SLACK_CUTOFF);
}

/**
 * True when an unattended checkout post must not go out: the check is from
 * before the cutoff, or it is past the 21-day retry window.
 */
export function checkoutPostTooOld(createdAt: string, now: number): boolean {
  if (checkoutCreatedBeforeSlackCutoff(createdAt)) return true;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return true;
  return now - created > CHECKOUT_POST_MAX_AGE_MS;
}

/** Why an unattended checkout post is skipped, or null when it should post. */
export function checkoutSlackSkipReason(createdAt: string, now: number): string | null {
  if (!checkoutPostTooOld(createdAt, now)) return null;
  return checkoutCreatedBeforeSlackCutoff(createdAt) ? CHECKOUT_BEFORE_CUTOFF : "older than 21d";
}

/** Start of the window the daily job may still post. Never earlier than the cutoff. */
export function checkoutAutopostOldest(now: number): string {
  return new Date(Math.max(now - CHECKOUT_POST_MAX_AGE_MS, Date.parse(CHECKOUT_SLACK_CUTOFF))).toISOString();
}

/** Drop links and setup paths. A stall notice stays plain text. */
export function slackPlain(value: string | null | undefined): string {
  const cleaned = (value || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\/setup\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "—";
}

export function stallSlackText(input: {
  unitNumber?: string | null;
  plate?: string | null;
  driverName?: string | null;
  dispatcherName?: string | null;
  startedAt: string;
  reason: string;
}): string {
  const unit = slackPlain(formatUnitLabel(input.unitNumber || "", input.plate || ""));
  return [
    "*Not sent*",
    `*Unit #:* ${unit}`,
    `*Driver:* ${slackPlain(input.driverName)}`,
    `*Dispatcher:* ${slackPlain(input.dispatcherName)}`,
    `*Started:* ${formatCheckoutTime(input.startedAt)}`,
    `*Reason:* ${slackPlain(input.reason)}`,
  ].join("\n");
}

/**
 * Why a stored Rad Cab check should get one stall notice, or null when it
 * should stay quiet. A phone that never reached the server is not represented
 * here: there is no row to notice.
 */
export function stallReason(input: {
  createdAt: string;
  sentAt?: string | null;
  archivedAt?: string | null;
  photoAngles: string[];
  requiredAngles: string[];
  now: number;
}): string | null {
  if (input.sentAt || input.archivedAt) return null;
  const created = Date.parse(input.createdAt);
  if (!Number.isFinite(created)) return null;
  const age = input.now - created;
  if (age < STALL_PHOTOS_AFTER_MS || age > STALL_LOOKBACK_MS) return null;
  const present = new Set(input.photoAngles);
  const missingPhoto = input.requiredAngles.some((angle) => angle && !present.has(angle));
  if (missingPhoto) return STALL_REASON_PHOTOS;
  if (age >= STALL_UNFINISHED_AFTER_MS) return STALL_REASON_UNFINISHED;
  return null;
}
