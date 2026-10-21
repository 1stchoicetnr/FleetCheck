/**
 * One-time clean slate for org-1st-choice-rad-cab.
 * Archive (never delete) reports and alerts created before rollout day,
 * and decide which logins stay active. Safe to run again: a second pass
 * archives nothing new once archived_at is set.
 */

export const ROLLOUT_SLATE_DAY = "2026-10-21";
export const ROLLOUT_SLATE_ZONE = "America/Los_Angeles";

const KEEP_EMAILS = new Set(["ashley@radcab.biz", "james@warecovery.com"]);

export type RolloutUserAction = "keep" | "deactivate" | "ambiguous";

export interface RolloutUserInput {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  /** When a membership was first written. Not used to spare demo emails. */
  approvedAt?: string | null;
}

export interface RolloutUserDecision {
  action: RolloutUserAction;
  reason: string;
}

export interface LiveMileageReport {
  vehicleId: string;
  odometer: number;
  completedAt: string;
  createdAt: string;
  archivedAt?: string | null;
}

function zonedParts(ms: number, timeZone: string): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: bag.year,
    month: bag.month,
    day: bag.day,
    hour: bag.hour,
    minute: bag.minute,
    second: bag.second,
  };
}

/** UTC instant when the zone's local clock is yyyy-mm-dd 00:00:00. */
export function zonedDayStartIso(ymd: string, timeZone: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  let ms = Date.UTC(year, month - 1, day, 8, 0, 0);
  for (let i = 0; i < 4; i += 1) {
    const parts = zonedParts(ms, timeZone);
    const local = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const target = Date.UTC(year, month - 1, day, 0, 0, 0);
    const delta = local - target;
    if (delta === 0) return new Date(ms).toISOString();
    ms -= delta;
  }
  return new Date(ms).toISOString();
}

export function rolloutSlateCutoffIso(): string {
  return zonedDayStartIso(ROLLOUT_SLATE_DAY, ROLLOUT_SLATE_ZONE);
}

export function calendarDayInZone(iso: string, timeZone: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const parts = zonedParts(ms, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isOnRolloutDay(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return calendarDayInZone(iso, ROLLOUT_SLATE_ZONE) === ROLLOUT_SLATE_DAY;
}

export function isBeforeRolloutSlate(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  const cutoff = Date.parse(rolloutSlateCutoffIso());
  return Number.isFinite(ms) && ms < cutoff;
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function jamesName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "james" || n.startsWith("james ");
}

function demoEmail(email: string): boolean {
  return email === "ashley@warecovery.com" || email.endsWith("@fleetcheck.local");
}

function retiredDuplicateJames(user: RolloutUserInput, email: string): boolean {
  if (!email.endsWith("@fleetcheck.local")) return false;
  if (user.id === "user-james") return true;
  return jamesName(user.name);
}

function jamesLike(user: RolloutUserInput, email: string): boolean {
  const local = email.split("@")[0] || "";
  return jamesName(user.name) || local === "james" || local.startsWith("james+");
}

/**
 * Named owners and anyone created on rollout day stay active.
 * Demo emails are deactivated even if a membership row was stamped that day.
 * A James login that is neither the owner email nor a fleetcheck.local row stays active.
 */
export function rolloutUserDecision(user: RolloutUserInput): RolloutUserDecision {
  const email = normalizedEmail(user.email);
  if (KEEP_EMAILS.has(email)) {
    return { action: "keep", reason: "named owner" };
  }
  if (isOnRolloutDay(user.createdAt)) {
    return { action: "keep", reason: "created on rollout day" };
  }
  if (isOnRolloutDay(user.approvedAt) && !demoEmail(email)) {
    return { action: "keep", reason: "approved on rollout day" };
  }
  if (email === "ashley@warecovery.com") {
    return { action: "deactivate", reason: "old office email" };
  }
  if (retiredDuplicateJames(user, email)) {
    return { action: "deactivate", reason: "retired duplicate James" };
  }
  if (email.endsWith("@fleetcheck.local")) {
    return { action: "deactivate", reason: "fleetcheck.local demo" };
  }
  if (jamesLike(user, email)) {
    return {
      action: "ambiguous",
      reason: "James row is not the owner email and not a fleetcheck.local demo",
    };
  }
  return { action: "keep", reason: "not a demo account" };
}

export interface RolloutSlateLogInput {
  alreadyApplied: boolean;
  appliedAt: string | null;
  before: { openReports: number; pendingReports: number; openAlerts: number };
  after: { openReports: number; pendingReports: number; openAlerts: number };
  archivedReports: number;
  archivedAlerts: number;
  deactivated: Array<{
    id: string;
    name: string;
    email: string;
    reason: string;
    alreadyInactive: boolean;
  }>;
  kept: Array<{ id: string; name: string; email: string; reason: string }>;
  ambiguous: Array<{ id: string; name: string; email: string; reason: string }>;
  mileageCleared: number;
  mileageFromLive: number;
}

export function rolloutSlateLogLines(result: RolloutSlateLogInput): string[] {
  if (result.alreadyApplied) {
    return [
      `[rollout-slate] already applied at ${result.appliedAt} open_reports=${result.after.openReports} open_pending=${result.after.pendingReports} open_alerts=${result.after.openAlerts}`,
    ];
  }
  const lines = [
    `[rollout-slate] before open_reports=${result.before.openReports} open_pending=${result.before.pendingReports} open_alerts=${result.before.openAlerts}`,
    `[rollout-slate] archived reports=${result.archivedReports} alerts=${result.archivedAlerts} mileage_cleared=${result.mileageCleared} mileage_from_live=${result.mileageFromLive}`,
    `[rollout-slate] after open_reports=${result.after.openReports} open_pending=${result.after.pendingReports} open_alerts=${result.after.openAlerts}`,
  ];
  for (const user of result.deactivated) {
    lines.push(
      `[rollout-slate] deactivated id=${user.id} email=${user.email} name=${user.name} reason=${user.reason} already_inactive=${user.alreadyInactive}`
    );
  }
  for (const user of result.kept) {
    lines.push(
      `[rollout-slate] kept id=${user.id} email=${user.email} name=${user.name} reason=${user.reason}`
    );
  }
  for (const user of result.ambiguous) {
    lines.push(
      `[rollout-slate] ambiguous id=${user.id} email=${user.email} name=${user.name} reason=${user.reason}`
    );
  }
  return lines;
}

/** Latest non-archived odometer for one vehicle. Undefined when none remain. */
export function liveOdometer(
  reports: LiveMileageReport[],
  vehicleId: string
): number | undefined {
  let best: { at: number; created: number; odometer: number } | null = null;
  for (const report of reports) {
    if (report.vehicleId !== vehicleId || report.archivedAt) continue;
    const at = Date.parse(report.completedAt);
    const created = Date.parse(report.createdAt);
    if (!Number.isFinite(at)) continue;
    if (
      !best ||
      at > best.at ||
      (at === best.at && created > best.created)
    ) {
      best = { at, created, odometer: report.odometer };
    }
  }
  return best?.odometer;
}
