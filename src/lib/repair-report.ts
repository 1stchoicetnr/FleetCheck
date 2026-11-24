import { RAD_CAB_COMPANY_ID } from "./company-rules.ts";
import { damageItemKeys } from "./damage-keys.ts";
import { damageCompareAngles, SIDE_PHOTO_ANGLE, type CompareReport } from "./damage-before-after.ts";
import { DAMAGE_SIDES, type CheckoutInspectionForm } from "./inspection-form.ts";
import { cleanDamageNote, photoAngleLabel } from "./photo-flags.ts";
import { withoutKnownDamage } from "./known-damage.ts";
import type { PhotoAngle, VehiclePhoto } from "./types.ts";

/**
 * Repair report: what #rad-cab-repairs (and Bell's DM) get for confirmed new
 * damage and for units set Out of Service. Mentions are configurable per fleet
 * in notification settings; Rad Cab defaults to Mark Corbett.
 */

export interface RepairMention {
  /** Slack member id, e.g. U07RCTY13J5. */
  id: string;
  name: string;
}

export const MARK_CORBETT: RepairMention = { id: "U07RCTY13J5", name: "Mark Corbett" };
export const REPAIR_MENTIONS_MAX = 5;
const SLACK_MEMBER_ID = /^[UW][A-Z0-9]{6,15}$/;

export function defaultRepairMentions(companyId: string): RepairMention[] {
  return companyId === RAD_CAB_COMPANY_ID ? [MARK_CORBETT] : [];
}

/** Valid Slack member ids only, no repeats, at most 5. Returns null when the list is not an array. */
export function cleanRepairMentions(value: unknown): RepairMention[] | null {
  if (!Array.isArray(value)) return null;
  const out: RepairMention[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as { id?: unknown; name?: unknown };
    const id = typeof r.id === "string" ? r.id.trim().toUpperCase() : "";
    if (!SLACK_MEMBER_ID.test(id) || out.some((m) => m.id === id)) continue;
    const name = typeof r.name === "string" ? r.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
    out.push({ id, name: name || id });
    if (out.length >= REPAIR_MENTIONS_MAX) break;
  }
  return out;
}

/**
 * "*For:* <@U07RCTY13J5>" — a real Slack mention. `plain` writes names only
 * (TEST posts must not notify anyone).
 */
export function mentionLine(mentions: readonly RepairMention[], plain = false): string | undefined {
  if (!mentions.length) return undefined;
  const who = mentions.map((m) => (plain ? m.name : `<@${m.id}>`)).join(" ");
  return `*For:* ${who}`;
}

/** "<@U07RCTY13J5>" for the short post; names only when `plain`. */
export function mentionText(mentions: readonly RepairMention[], plain = false): string | undefined {
  if (!mentions.length) return undefined;
  return mentions.map((m) => (plain ? m.name : `<@${m.id}>`)).join(" ");
}

export interface CheckRef {
  reportId: string;
  completedAt: string;
  driverName: string;
}

export interface WhoHadItLast {
  foundBy: CheckRef;
  /** Latest earlier check where every damaged slot was photographed with no damage. */
  lastClean?: CheckRef;
  /** Checks after the clean one (or all earlier ones when none), oldest first. */
  between: CheckRef[];
  /** Earlier checks left out of `between` to keep the post short. */
  more: number;
}

type HistoryReport = CompareReport & {
  photos: ReadonlyArray<Pick<VehiclePhoto, "angle" | "flaggedDamage" | "damageNote" | "dataUrl"> & {
    knownDamageAnswer?: "same" | "new";
    knownDamageId?: string;
    damageReview?: { kind: "false_report" | "missed_damage" };
  }>;
};

const ref = (r: CompareReport): CheckRef => ({
  reportId: r.id,
  completedAt: r.completedAt,
  driverName: r.driverName,
});

/** A slot is clean on a check when it has a photo there and no new damage on it. Known damage answered "Same" counts as clean. */
function cleanOn(check: HistoryReport, angles: readonly PhotoAngle[]): boolean {
  const damaged = damageCompareAngles(damageItemKeys(withoutKnownDamage(check)));
  if (!angles.length) return damaged.length === 0 && damageItemKeys(withoutKnownDamage(check)).length === 0;
  return angles.every((angle) => check.photos.some((p) => p.angle === angle && p.dataUrl) && !damaged.includes(angle));
}

/**
 * Who had the car last: the check that found the damage, the last check where
 * those slots were clean, and every check in between.
 */
export function whoHadItLast(
  report: HistoryReport,
  history: readonly HistoryReport[],
  options: { angles?: readonly PhotoAngle[]; maxBetween?: number } = {}
): WhoHadItLast {
  const angles = options.angles ?? damageCompareAngles(damageItemKeys(withoutKnownDamage(report)));
  const now = Date.parse(report.completedAt);
  const earlier = history
    .filter((item) => item.id !== report.id && Date.parse(item.completedAt) < now)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const cleanIndex = earlier.findIndex((check) => cleanOn(check, angles));
  const since = cleanIndex >= 0 ? earlier.slice(0, cleanIndex) : earlier;
  const max = options.maxBetween ?? 10;
  const oldestFirst = [...since].reverse();
  const between = oldestFirst.slice(-max).map(ref);
  return {
    foundBy: ref(report),
    lastClean: cleanIndex >= 0 ? ref(earlier[cleanIndex]) : undefined,
    between,
    more: Math.max(0, since.length - between.length),
  };
}

export function whoHadItLastLines(
  info: WhoHadItLast,
  checkUrl: (reportId: string) => string,
  formatTime: (iso: string) => string
): string[] {
  const link = (c: CheckRef) => `<${checkUrl(c.reportId)}|${formatTime(c.completedAt)} · ${c.driverName}>`;
  const lines = [`*Found by:* ${link(info.foundBy)}`];
  lines.push(info.lastClean ? `*Last clean check:* ${link(info.lastClean)}` : "*Last clean check:* none on record");
  lines.push("*Had it since then:*");
  if (info.more) lines.push(`• …${info.more} earlier check${info.more === 1 ? "" : "s"}`);
  if (info.between.length) lines.push(...info.between.map((c) => `• ${link(c)}`));
  else lines.push("• nobody in between");
  return lines;
}

export interface RepairReportInput {
  kind: "damage" | "out_of_service";
  unit: string;
  plate?: string;
  vehicle: string;
  mention?: string;
  /** Damage items ("Front: Bumper damage"). */
  damage: string[];
  beforeAfter: string[];
  whoHadIt: string[];
  status: string;
  link: { url: string; label: string };
  /** Shown first, e.g. "TEST – not a real alert". */
  banner?: string;
}

/** One message for both #rad-cab-repairs and Bell's DM. Slack mrkdwn. */
export function repairReportText(input: RepairReportInput): string {
  const title = input.kind === "out_of_service" ? "Out of Service" : "New damage";
  return [
    ...(input.banner ? [input.banner, ""] : []),
    `*Repair report: ${title}* · ${input.unit}`,
    ...(input.mention ? [input.mention] : []),
    `*Vehicle:* ${input.vehicle}${input.plate ? ` · ${input.plate}` : ""}`,
    input.damage.length ? `*Damage:*\n${input.damage.map((d) => `• ${d}`).join("\n")}` : "*Damage:* none entered",
    ...input.beforeAfter,
    ...input.whoHadIt,
    `*Status:* ${input.status}`,
    `<${input.link.url}|${input.link.label}>`,
  ].join("\n");
}

/** "Out of Service (set by Bell · reason)" / "In service" plus open known damage on the slot. */
export function repairStatusText(input: {
  outOfService?: { by: string; reason?: string } | null;
  known?: string[];
}): string {
  const base = input.outOfService
    ? `Out of Service (set by ${input.outOfService.by}${input.outOfService.reason ? ` · ${input.outOfService.reason}` : ""})`
    : "In service";
  return input.known?.length ? `${base} · known damage: ${input.known.join("; ")}` : base;
}

/** Slack mrkdwn to plain Markdown, for posting a preview through a Markdown-only tool. */
export function slackToMarkdown(text: string): string {
  return text
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "[$2]($1)")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1**$2**");
}

// --- Short damage post (#rad-cab-repairs and Bell's DM) -----------------------

/** "#9 Caravan", "#5 Chrysler 200", "#11 Chrysler 200" (unit already names the car). */
export function shortUnitLabel(input: { unitNumber?: string; make?: string; model?: string; plate?: string }): string {
  const raw = (input.unitNumber ?? "").trim().replace(/^unit\s+/i, "").replace(/^#\s*/, "");
  const model = (input.model ?? "").trim().replace(/^(gr|grand)\s+/i, "");
  const make = (input.make ?? "").trim();
  const car = model && /[a-z]{3,}/i.test(model) ? model : [make, model].filter(Boolean).join(" ");
  if (!raw) return [input.plate?.trim(), car].filter(Boolean).join(" ") || "Unit";
  const match = /^0*(\d+)(.*)$/.exec(raw);
  const number = match ? `#${match[1] || "0"}${match[2]}` : raw;
  // Unit names like "#11 Chrysler 200" already say which car it is.
  if (/[a-z]{3,}/i.test(match ? match[2] : raw)) return number;
  return car ? `${number} ${car}` : number;
}

/** "11/23 11:49 AM PT". */
export function shortPacificTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute} ${parts.dayPeriod} PT`;
}

const lowerFirst = (text: string) => (/^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export interface DamageSummaryItem {
  /** "front", "rear", "driver side doors". */
  where: string;
  /** Driver's words; empty when the driver only flagged it. */
  what?: string;
}

/**
 * One line for the post: same words on several sides are grouped.
 * "bumper damage (front and rear); dent (left)". Long lists are cut with "…".
 */
export function damageSummaryText(items: readonly DamageSummaryItem[], extra: readonly string[] = [], max = 160): string {
  const groups: Array<{ what: string; key: string; where: string[] }> = [];
  for (const item of items) {
    const what = item.what?.trim() ? lowerFirst(item.what.trim().replace(/[.\s]+$/, "")) : "damage";
    const key = what.toLowerCase();
    const where = item.where.toLowerCase();
    const group = groups.find((g) => g.key === key);
    if (group) {
      if (!group.where.includes(where)) group.where.push(where);
    } else groups.push({ what, key, where: [where] });
  }
  const parts = [
    ...extra.map((e) => lowerFirst(e.trim())).filter(Boolean),
    ...groups.map((g) => `${g.what} (${joinWords(g.where)})`),
  ];
  const text = parts.join("; ") || "damage reported";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export interface ShortDamagePostInput {
  unitLabel: string;
  summary: string;
  foundBy: string;
  foundAt: string;
  outOfService?: boolean;
  url: string;
  mention?: string;
  banner?: string;
}

/**
 * The 3-line repair post:
 *   *#9 Caravan, new damage:* bumper scrapes (left and rear)
 *   Found by Ken Taylor, 11/23 11:49 AM PT · In service
 *   <Open the check> · @Mark Corbett
 * Before/after, who had it, and the last clean check are on the check page.
 */
export function shortDamagePostText(input: ShortDamagePostInput): string {
  const when = shortPacificTime(input.foundAt);
  return [
    ...(input.banner ? [input.banner, ""] : []),
    `*${input.unitLabel}, new damage:* ${input.summary}`,
    `Found by ${input.foundBy}${when ? `, ${when}` : ""} · ${input.outOfService ? "Out of service" : "In service"}`,
    `<${input.url}|Open the check>${input.mention ? ` · ${input.mention}` : ""}`,
  ].join("\n");
}

const SIDE_WORD: Record<string, string> = { front: "front", rear: "rear", left: "left", right: "right" };

/** What the short post lists: Precheck notes and marks by side, then flagged photos not already covered. */
export function damageSummaryItems(report: {
  photos: ReadonlyArray<Pick<VehiclePhoto, "angle" | "flaggedDamage" | "damageNote">>;
  inspectionForm?: CheckoutInspectionForm | null;
}): DamageSummaryItem[] {
  const items: DamageSummaryItem[] = [];
  const covered = new Map<string, string | undefined>();
  const damage = report.inspectionForm?.damage ?? {};
  const marks = new Set((damage.marks ?? []).map(String));
  for (const side of DAMAGE_SIDES) {
    const note = cleanDamageNote(damage[side.id]);
    if (!note && !marks.has(side.id)) continue;
    items.push({ where: SIDE_WORD[side.id] ?? side.label.toLowerCase(), what: note });
    covered.set(SIDE_PHOTO_ANGLE[side.id] ?? side.id, note?.toLowerCase());
  }
  for (const photo of report.photos) {
    if (!photo.flaggedDamage) continue;
    const note = cleanDamageNote(photo.damageNote);
    if (covered.has(photo.angle) && (!note || covered.get(photo.angle) === note.toLowerCase())) continue;
    items.push({ where: photoAngleLabel(photo.angle).toLowerCase(), what: note });
  }
  return items;
}
