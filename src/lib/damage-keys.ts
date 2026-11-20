import { DAMAGE_SIDES, ISSUE_FLAG_ITEMS } from "./inspection-form.ts";
import type { CheckoutInspectionForm, DamageSide } from "./inspection-form.ts";
import { cleanDamageNote, isPhotoDamageFlagged } from "./photo-flags.ts";
import type { PhotoAngle, VehiclePhoto } from "./types.ts";

/**
 * One damage item on a check, keyed by area + item so the same dent on the
 * next check matches the open alert instead of making a new one.
 *
 *   form note    "front|bumper damage"
 *   photo flag   "front|bumper damage"   (angle id + note, "flagged" when no note)
 *   marked side  "left|marked"           (only when that side has no note)
 *   issue flag   "flag:needsrepair"
 */
export type DamageKey = string;

export interface DamageKeySource {
  photos: ReadonlyArray<Pick<VehiclePhoto, "angle" | "flaggedDamage" | "damageNote">>;
  inspectionForm?: CheckoutInspectionForm | null;
}

/** Lowercase, single spaces, no trailing punctuation. "Bumper  Damage." -> "bumper damage". */
export function normalizeDamageText(text?: string | null): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.,;:!?-]+$/g, "")
    .trim();
}

export function flagKey(id: string): DamageKey {
  return `flag:${id.toLowerCase()}`;
}

export function noteKey(side: DamageSide, note: string): DamageKey {
  return `${side}|${normalizeDamageText(note)}`;
}

export function markKey(side: DamageSide): DamageKey {
  return `${side}|marked`;
}

export function photoKey(angle: PhotoAngle | string, note?: string | null): DamageKey {
  return `${angle}|${normalizeDamageText(note) || "flagged"}`;
}

/** Safety and refuse-to-drive always alert and notify, even if already flagged. */
export const ALWAYS_NOTIFY_KEYS: ReadonlySet<DamageKey> = new Set([
  flagKey("safety"),
  flagKey("refuseToDrive"),
]);

export function damageItemKeys(report: DamageKeySource): DamageKey[] {
  const keys: DamageKey[] = [];
  const add = (key: DamageKey) => {
    if (!keys.includes(key)) keys.push(key);
  };
  const form = report.inspectionForm ?? undefined;
  for (const item of ISSUE_FLAG_ITEMS) {
    if (form?.issueFlags?.[item.id]) add(flagKey(item.id));
  }
  const damage = form?.damage ?? {};
  const marks = new Set((damage.marks ?? []).map(String));
  for (const side of DAMAGE_SIDES) {
    const note = cleanDamageNote(damage[side.id]);
    if (note && normalizeDamageText(note)) add(noteKey(side.id, note));
    else if (marks.has(side.id)) add(markKey(side.id));
  }
  for (const photo of report.photos) {
    if (isPhotoDamageFlagged(photo)) add(photoKey(photo.angle, cleanDamageNote(photo.damageNote)));
  }
  return keys;
}

/** The area part of a key: an angle id, a damage side, or undefined for issue flags. */
export function damageKeyArea(key: DamageKey): string | undefined {
  if (key.startsWith("flag:")) return undefined;
  const bar = key.indexOf("|");
  return bar > 0 ? key.slice(0, bar) : undefined;
}

export interface OpenDamageAlert {
  id: string;
  reportId?: string;
  keys: DamageKey[];
  /** Later checks already counted on this alert. */
  reportIds: string[];
}

export interface DamageAlertPlan {
  /** Items not on any open alert. A new alert (and Slack post) is needed when non-empty. */
  newKeys: DamageKey[];
  /** Open alerts this check repeats. Bump them, no Slack. */
  bumpIds: string[];
}

/**
 * Decide what a check's damage does. `open` is the vehicle's open (not
 * archived, not deleted) damage alerts, newest first. Each repeated item bumps
 * the newest open alert that has it; anything else is new. Checks already
 * counted on an alert are not counted again, so calling this twice for the same
 * check is safe.
 */
export function planDamageAlert(input: {
  reportId: string;
  keys: DamageKey[];
  open: OpenDamageAlert[];
}): DamageAlertPlan {
  const newKeys: DamageKey[] = [];
  const bumpIds: string[] = [];
  for (const key of input.keys) {
    const own = input.open.find((alert) => alert.reportId === input.reportId && alert.keys.includes(key));
    if (own) continue;
    if (ALWAYS_NOTIFY_KEYS.has(key)) {
      newKeys.push(key);
      continue;
    }
    const match = input.open.find(
      (alert) => alert.reportId !== input.reportId && alert.keys.includes(key)
    );
    if (!match) {
      newKeys.push(key);
      continue;
    }
    if (!match.reportIds.includes(input.reportId) && !bumpIds.includes(match.id)) {
      bumpIds.push(match.id);
    }
  }
  return { newKeys, bumpIds };
}

/** "Reported 3 times · last Nov 20 by Ken Taylor". Empty for a single report. */
export function repeatReportLine(
  alert: { reportCount?: number; lastReportedAt?: string; lastActorName?: string },
  formatTime: (iso: string) => string
): string {
  const count = alert.reportCount ?? 1;
  if (count < 2) return "";
  const parts = [`Reported ${count} times`];
  if (alert.lastReportedAt) {
    parts.push(
      `last ${formatTime(alert.lastReportedAt)}${alert.lastActorName ? ` by ${alert.lastActorName}` : ""}`
    );
  }
  return parts.join(" · ");
}

/**
 * The vehicle's open damage alerts with the items each covers, newest first.
 * Alerts saved before damage keys existed get their items from their check.
 */
export async function openDamageAlerts(
  existing: ReadonlyArray<{
    id: string;
    type: string;
    vehicleId: string;
    reportId?: string;
    createdAt: string;
    archivedAt?: string;
    damageKeys?: string[];
    reportIds?: string[];
  }>,
  vehicleId: string,
  loadReport: (id: string) => Promise<DamageKeySource | undefined>
): Promise<OpenDamageAlert[]> {
  const open = existing
    .filter((alert) => alert.type === "damage_reported" && alert.vehicleId === vehicleId && !alert.archivedAt)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return Promise.all(
    open.map(async (alert) => {
      let keys = alert.damageKeys;
      if (!keys?.length && alert.reportId) {
        const source = await loadReport(alert.reportId).catch(() => undefined);
        keys = source ? damageItemKeys(source) : [];
      }
      return {
        id: alert.id,
        reportId: alert.reportId,
        keys: keys ?? [],
        reportIds: alert.reportIds ?? [],
      };
    })
  );
}
