import { officeCheckUrl } from "./alert-details.ts";
import { postsRepairSlack } from "./checkout-slack-route.ts";
import { activeIssueFlagLabels, type CheckoutInspectionForm } from "./inspection-form.ts";
import {
  damageSummaryItems,
  damageSummaryText,
  shortPacificTime,
  shortUnitLabel,
} from "./repair-report.ts";
import type { VehiclePhoto } from "./types.ts";

/**
 * Rad Cab confirmed damage is not posted one item at a time. Items wait in
 * the queue and go out as one digest at 1:00 PM Pacific. Out-of-service
 * reports stay immediate. Other fleets do not post to the repair channel.
 *
 * Hobby cron jobs run at most once a day, and 1:00 PM Pacific is 20:00 UTC
 * in summer (PDT) and 21:00 UTC in winter (PST). The schedule fires at both
 * hours. Only the run whose local Pacific hour is 13 sends.
 */

export type RepairNoticeKind = "damage" | "out_of_service";
export type RepairNoticePlan = "digest" | "immediate" | "skip";

export function repairNoticePlan(companyId: string | undefined | null, kind: RepairNoticeKind): RepairNoticePlan {
  if (!postsRepairSlack(companyId)) return "skip";
  return kind === "out_of_service" ? "immediate" : "digest";
}

export interface RepairDigestItem {
  id: string;
  orgId: string;
  companyId: string;
  reportId: string;
  vehicleId: string;
  unitLabel: string;
  summary: string;
  foundBy: string;
  foundAt: string;
  createdAt: string;
  digestedAt?: string;
  digestKey?: string;
}

export function repairDigestItemId(alertIds: readonly string[]): string {
  const ids = [...new Set(alertIds.map((id) => id.trim()).filter(Boolean))].sort();
  return `digest:${ids.join("+") || "damage"}`.slice(0, 180);
}

export function repairDigestItemFromReport(
  report: {
    id: string;
    companyId: string;
    vehicleId: string;
    unitNumber?: string;
    plate?: string;
    make?: string;
    model?: string;
    driverName: string;
    completedAt: string;
    photos: ReadonlyArray<Pick<VehiclePhoto, "angle" | "flaggedDamage" | "damageNote">>;
    inspectionForm?: CheckoutInspectionForm | null;
  },
  alertIds: readonly string[],
  now: Date = new Date()
): RepairDigestItem {
  return {
    id: repairDigestItemId(alertIds),
    orgId: "",
    companyId: report.companyId,
    reportId: report.id,
    vehicleId: report.vehicleId,
    unitLabel: shortUnitLabel(report),
    summary: damageSummaryText(damageSummaryItems(report), activeIssueFlagLabels(report.inspectionForm)),
    foundBy: report.driverName || "Driver",
    foundAt: report.completedAt,
    createdAt: now.toISOString(),
  };
}

/** Local Pacific hour, 0–23. */
export function pacificHour(now: Date): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  const hour = Number(raw);
  if (!Number.isFinite(hour)) return -1;
  return hour === 24 ? 0 : hour;
}

/** True only during the 1:00 PM Pacific hour. */
export function shouldSendRepairDigest(now: Date): boolean {
  return pacificHour(now) === 13;
}

export interface DigestLine {
  id?: string;
  vehicleId: string;
  unitLabel: string;
  summary: string;
  foundBy: string;
  foundAt: string;
  reportId: string;
}

export interface DigestGroup {
  vehicleId: string;
  unitLabel: string;
  items: DigestLine[];
}

const time = (iso: string) => {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
};

/** One group per unit, earliest find first. Items inside a unit are earliest first. */
export function groupDigestItems(items: readonly DigestLine[]): DigestGroup[] {
  const groups: DigestGroup[] = [];
  const sorted = [...items].sort(
    (a, b) => time(a.foundAt) - time(b.foundAt) || (a.id ?? a.reportId).localeCompare(b.id ?? b.reportId)
  );
  for (const item of sorted) {
    const group = groups.find((entry) => entry.vehicleId === item.vehicleId);
    if (group) group.items.push(item);
    else groups.push({ vehicleId: item.vehicleId, unitLabel: item.unitLabel, items: [item] });
  }
  return groups;
}

/**
 * One Slack mrkdwn message. The mention (Mark) is on the first line only.
 * Empty input returns "" so the caller posts nothing.
 */
export function repairDigestText(
  items: readonly DigestLine[],
  options: { origin: string; mention?: string }
): string {
  const groups = groupDigestItems(items);
  if (!groups.length) return "";
  const lines = [`*Rad Cab damage digest*${options.mention ? ` · ${options.mention}` : ""}`];
  for (const group of groups) {
    lines.push("", `*${group.unitLabel}*`);
    for (const item of group.items) {
      const when = shortPacificTime(item.foundAt);
      const url = officeCheckUrl(options.origin, item.reportId);
      lines.push(item.summary);
      lines.push(`Found by ${item.foundBy}${when ? `, ${when}` : ""} · <${url}|Open the check>`);
    }
  }
  return lines.join("\n");
}

export interface RepairDigestRunResult {
  posted: boolean;
  reason: "not-1pm" | "empty" | "sent" | "unconfigured";
  count: number;
}

/**
 * Send the digest when it is 1 PM Pacific and the queue has items.
 * `claim` must mark the returned rows so a second call cannot return them.
 * When the queue is empty, or it is not 1 PM, `post` is not called.
 */
export async function sendDueRepairDigest(input: {
  now: Date;
  origin: string;
  mention?: string;
  claim: (digestKey: string, atIso: string) => Promise<readonly DigestLine[]>;
  post: (text: string) => Promise<void>;
  /** Pacific date key stored on claimed rows. Defaults to the PT calendar date. */
  digestKey?: string;
}): Promise<RepairDigestRunResult> {
  if (!shouldSendRepairDigest(input.now)) return { posted: false, reason: "not-1pm", count: 0 };
  const key = input.digestKey ?? pacificDigestKey(input.now);
  const items = await input.claim(key, input.now.toISOString());
  const text = repairDigestText(items, { origin: input.origin, mention: input.mention });
  if (!text) return { posted: false, reason: "empty", count: 0 };
  await input.post(text);
  return { posted: true, reason: "sent", count: items.length };
}

export function pacificDigestKey(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Damage queues. Out of service posts now. Other fleets do neither.
 * The callbacks run only for the plan that applies.
 */
export async function deliverRadCabDamage(input: {
  companyId: string | undefined | null;
  kind: RepairNoticeKind;
  enqueue: () => Promise<void>;
  postNow: () => Promise<void>;
}): Promise<"queued" | "posted" | "skipped"> {
  const plan = repairNoticePlan(input.companyId, input.kind);
  if (plan === "digest") {
    await input.enqueue();
    return "queued";
  }
  if (plan === "immediate") {
    await input.postNow();
    return "posted";
  }
  return "skipped";
}
