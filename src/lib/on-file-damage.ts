import { SIDE_PHOTO_ANGLE } from "./damage-before-after.ts";
import { DAMAGE_SIDES } from "./inspection-form.ts";
import type { CheckoutInspectionForm } from "./inspection-form.ts";
import { withoutKnownDamage, type DamageReviewMark, type KnownDamage, type KnownDamageStatus } from "./known-damage.ts";
import { cleanDamageNote } from "./photo-flags.ts";
import type { PhotoAngle, VehiclePhoto } from "./types.ts";

/**
 * Damage already on file for a unit, so the same damage is not posted as
 * "new damage" on every check.
 *
 * On file means either:
 * - known damage the office marked ("Known – not fixing" / "Fix later"), or
 * - damage a driver already reported on an earlier check that nobody has
 *   reviewed yet (not marked known, not marked "Not new").
 *
 * Matching needs the same photo slot and compatible damage description, not just
 * any damage on that side. It clears
 * when the office marks damage on that slot Repaired: reports made before the
 * repair no longer count. The driver's "New damage" answer always wins, so new
 * damage next to old damage still alerts.
 */

type OnFilePhoto = Pick<VehiclePhoto, "angle" | "flaggedDamage" | "damageNote"> & {
  dataUrl?: string;
  knownDamageId?: string;
  knownDamageAnswer?: "same" | "new";
  damageSpot?: { x: number; y: number };
  damageReview?: DamageReviewMark;
};

export interface OnFileCheck {
  id: string;
  completedAt: string;
  driverName: string;
  photos: readonly OnFilePhoto[];
  inspectionForm?: CheckoutInspectionForm | null;
}

export interface OnFileDamage {
  /** Known-damage id, or `rep:<reportId>:<angle>` for reported, not-reviewed damage. */
  id: string;
  angle: PhotoAngle;
  description: string;
  source: "known" | "reported";
  status?: KnownDamageStatus;
  /** The check whose photo shows it. */
  sourceReportId?: string;
  firstReportedAt: string;
  firstReportedBy: string;
  /** Reported damage: how many checks have reported it (including Same answers). */
  sightings: number;
  lastSeenAt?: string;
  lastSeenBy?: string;
  /** Known damage: the driver's words on the check the office marked, matched too. */
  alsoKnownAs?: string[];
}

export interface DamageSlot {
  angle: PhotoAngle;
  /** Driver's words, e.g. "Bumper damage". */
  description: string;
}

const REPORTED_PREFIX = "rep:";

export function reportedDamageId(reportId: string, angle: string): string {
  return `${REPORTED_PREFIX}${reportId}:${angle}`;
}

export function parseReportedDamageId(id?: string | null): { reportId: string; angle: string } | null {
  if (!id?.startsWith(REPORTED_PREFIX)) return null;
  const rest = id.slice(REPORTED_PREFIX.length);
  const at = rest.lastIndexOf(":");
  if (at <= 0 || at === rest.length - 1) return null;
  return { reportId: rest.slice(0, at), angle: rest.slice(at + 1) };
}

const sideAngle = (side: string): PhotoAngle => (SIDE_PHOTO_ANGLE[side] ?? side) as PhotoAngle;

/**
 * New-damage photo slots on a check, with the driver's words. Damage the
 * driver answered "Same as before" on, and photos the office marked
 * "Not new", are left out.
 */
export function damageSlotsOnCheck(check: Pick<OnFileCheck, "photos" | "inspectionForm">): DamageSlot[] {
  const report = withoutKnownDamage(check);
  const falseReport = new Set(
    report.photos.filter((p) => p.damageReview?.kind === "false_report").map((p) => p.angle as string)
  );
  const out = new Map<string, string[]>();
  const add = (angle: PhotoAngle, text?: string) => {
    if (falseReport.has(angle)) return;
    const list = out.get(angle) ?? [];
    if (text && !list.includes(text)) list.push(text);
    out.set(angle, list);
  };
  const damage = report.inspectionForm?.damage ?? {};
  const marks = new Set((damage.marks ?? []).map(String));
  for (const side of DAMAGE_SIDES) {
    const note = cleanDamageNote(damage[side.id]);
    if (note) add(sideAngle(side.id), note);
    else if (marks.has(side.id)) add(sideAngle(side.id));
  }
  for (const photo of report.photos) {
    if (photo.flaggedDamage) add(photo.angle, cleanDamageNote(photo.damageNote));
  }
  return [...out].map(([angle, texts]) => ({
    angle: angle as PhotoAngle,
    description: texts.join("; ") || "Damage",
  }));
}

const time = (iso?: string) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : NaN;
};

/**
 * Everything on file for the unit as of `asOf` (normally the new check's
 * time). `history` is the unit's other checks in any order; checks at or after
 * `asOf` are ignored. `known` is the unit's known-damage list, repaired included.
 */
export function onFileDamage(
  history: readonly OnFileCheck[],
  known: readonly KnownDamage[],
  asOf: string
): OnFileDamage[] {
  const now = time(asOf);
  const at = (iso?: string) => time(iso) <= now;
  const out: OnFileDamage[] = [];
  const activeKnown = known.filter((k) => at(k.createdAt) && !(k.repairedAt && at(k.repairedAt)));
  for (const k of activeKnown) {
    out.push({
      id: k.id,
      angle: k.angle,
      description: k.description,
      source: "known",
      status: k.status,
      sourceReportId: k.sourceReportId,
      firstReportedAt: k.createdAt,
      firstReportedBy: k.createdBy,
      sightings: 0,
    });
  }
  const repairs = known.filter((k) => k.repairedAt && at(k.repairedAt));
  const earlier = history
    .filter((c) => Number.isFinite(time(c.completedAt)) && time(c.completedAt) < now)
    .sort((a, b) => time(a.completedAt) - time(b.completedAt));
  const reported = new Map<string, OnFileDamage>();
  const aliases = new Map<string, string[]>();
  for (const check of earlier) {
    const when = time(check.completedAt);
    const slots = damageSlotsOnCheck(check);
    // A "Same as before" answer about reported damage is another sighting of it.
    const sameSlots = check.photos
      .filter((p) => p.knownDamageAnswer === "same" && !p.flaggedDamage && p.damageReview?.kind !== "missed_damage")
      .map((p) => p.angle as string);
    for (const slot of slots) {
      if (repairs.some((k) => k.angle === slot.angle && time(k.repairedAt) >= when &&
        (k.sourceReportId === check.id || damageDescriptionsMatch(slot.description, k.description)))) continue;
      const knownItem = out.find(
        (k) =>
          k.angle === slot.angle &&
          (k.sourceReportId === check.id ||
            [k.description, ...(aliases.get(k.id) ?? [])].some((d) => damageDescriptionsMatch(slot.description, d)))
      );
      if (knownItem) {
        // The office marked this report as known: its wording matches later checks, too.
        if (knownItem.sourceReportId === check.id) aliases.set(knownItem.id, [...(aliases.get(knownItem.id) ?? []), slot.description]);
        knownItem.sightings += 1;
        knownItem.lastSeenAt = check.completedAt;
        knownItem.lastSeenBy = check.driverName;
        continue;
      }
      const prior = [...reported.values()].find((item) => item.angle === slot.angle && damageDescriptionsMatch(slot.description, item.description));
      if (prior) {
        prior.sightings += 1;
        prior.lastSeenAt = check.completedAt;
        prior.lastSeenBy = check.driverName;
      } else {
        reported.set(reportedDamageId(check.id, slot.angle), {
          id: reportedDamageId(check.id, slot.angle),
          angle: slot.angle,
          description: slot.description,
          source: "reported",
          sourceReportId: check.id,
          firstReportedAt: check.completedAt,
          firstReportedBy: check.driverName,
          sightings: 1,
          lastSeenAt: check.completedAt,
          lastSeenBy: check.driverName,
        });
      }
    }
    for (const angle of sameSlots) {
      const photo = check.photos.find((p) => p.angle === angle);
      const prior = photo?.knownDamageId
        ? reported.get(photo.knownDamageId) ?? out.find((item) => item.id === photo.knownDamageId)
        : undefined;
      if (!prior || slots.some((s) => s.angle === angle)) continue;
      prior.sightings += 1;
      prior.lastSeenAt = check.completedAt;
      prior.lastSeenBy = check.driverName;
    }
  }
  for (const item of out) {
    const extra = aliases.get(item.id);
    if (extra?.length) item.alsoKnownAs = [...new Set(extra)];
  }
  out.push(...reported.values());
  return out;
}

export interface RepeatSighting {
  angle: PhotoAngle;
  /** What this check's driver wrote. */
  description: string;
  onFile: OnFileDamage;
}

/** Leave damage on these slots out of a check (form notes, diagram marks, photo flags). */
export function withoutDamageSlots<T extends Pick<OnFileCheck, "photos" | "inspectionForm">>(
  report: T,
  slots: ReadonlySet<string>
): T {
  if (!slots.size) return report;
  const photos = report.photos.map((p) =>
    p.flaggedDamage && slots.has(p.angle) ? { ...p, flaggedDamage: false } : p
  );
  const form = report.inspectionForm;
  let inspectionForm = form;
  if (form?.damage) {
    const damage = { ...form.damage };
    for (const side of DAMAGE_SIDES) {
      if (!slots.has(sideAngle(side.id))) continue;
      if (cleanDamageNote(damage[side.id])) damage[side.id] = "";
      if (damage.marks?.includes(side.id)) damage.marks = damage.marks.filter((m) => m !== side.id);
    }
    inspectionForm = { ...form, damage };
  }
  return { ...report, photos, inspectionForm } as T;
}

/** Conservative description matching. Unknown or conflicting details alert rather than hide damage. */
export function damageDescriptionsMatch(current: string, prior: string): boolean {
  if (/\b(new|another|additional|worse|worsened|bigger|larger|fresh)\b/i.test(current)) return false;
  const signature = (text: string) => {
    const words = text.toLowerCase()
      .replace(/\b(debt|crease|crunched|dents?|dented)\b/g, "dent")
      .replace(/\b(fender|quarter(?: panel)?)\b/g, "quarter")
      .replace(/\b(scrapedb?|scrapes?|scratches|scratched|scratch|scuffs?|scuffed)\b/g, "scrape")
      .replace(/[^a-z0-9 ]/g, " ").split(/\s+/);
    return {
      words: [...new Set(words.filter(Boolean))].sort().join(" "),
      parts: [...new Set(words.filter((w) => ["bumper", "door", "quarter", "hood", "roof", "windshield", "mirror", "trunk", "wheel", "tire", "headlight", "taillight", "window"].includes(w)))].sort(),
      kinds: [...new Set(words.filter((w) => ["dent", "scrape", "crack", "cracked", "broken", "missing", "puncture", "chip"].includes(w)))].sort(),
      locations: words.filter((w) => ["front", "rear", "left", "right"].includes(w)).sort(),
    };
  };
  const a = signature(current), b = signature(prior);
  // Only flagged or marked, no words: nothing says it is different. The
  // driver's Same / New question is what catches new damage here.
  if (["", "damage", "marked", "flagged"].includes(a.words)) return true;
  if (a.words === b.words && !["", "damage", "marked", "flagged"].includes(a.words)) return true;
  if (!a.parts.length || !b.parts.length || a.parts.join() !== b.parts.join()) return false;
  // Do not treat a different component location as the same (front door vs rear door).
  if (a.locations.length && b.locations.length && a.locations.join() !== b.locations.join()) return false;
  // A dent beside a scrape is new. Generic "bumper damage" can match an older
  // specific bumper report; unrecognized detail must match exactly instead.
  if (a.kinds.length && b.kinds.length) return a.kinds.join() === b.kinds.join();
  const generic = (text: string) => /^(?:bumper|door|quarter|front|rear|left|right|damage|damaged|has|is|the|a|as|always|back|been|abused|and|on|both|side|sides|marks|panel| )+$/.test(text.toLowerCase());
  return (!a.kinds.length && generic(current)) || (!b.kinds.length && generic(prior));
}

/**
 * Split a check's damage into new damage (alerts) and matching on-file damage
 * (kept on the saved check, no duplicate alert). Explicit New always wins,
 * including new damage next to an old item on the very same photo slot.
 */
export function splitNewDamage<T extends Pick<OnFileCheck, "photos" | "inspectionForm">>(
  report: T,
  onFile: readonly OnFileDamage[]
): { report: T; repeats: RepeatSighting[]; newSlots: DamageSlot[] } {
  const saidNew = new Set(
    report.photos.filter((p) => p.knownDamageAnswer === "new" || p.damageReview?.kind === "missed_damage").map((p) => p.angle as string)
  );
  const repeats: RepeatSighting[] = [];
  const newSlots: DamageSlot[] = [];
  for (const slot of damageSlotsOnCheck(report)) {
    const match = saidNew.has(slot.angle) ? undefined : onFile.find((item) =>
      item.angle === slot.angle &&
      [item.description, ...(item.alsoKnownAs ?? [])].some((d) => damageDescriptionsMatch(slot.description, d))
    );
    if (match) repeats.push({ angle: slot.angle, description: slot.description, onFile: match });
    else newSlots.push(slot);
  }
  return {
    report: withoutDamageSlots(withoutKnownDamage(report) as T, new Set(repeats.map((r) => r.angle))),
    repeats,
    newSlots,
  };
}

/** Reported, not-reviewed damage shaped as a Same / New question for the driver's photo step. */
export function reportedDamagePrompts(onFile: readonly OnFileDamage[], formatDate: (iso: string) => string) {
  return onFile
    .filter((item) => item.source === "reported")
    .map((item) => ({
      id: item.id,
      angle: item.angle,
      description: item.description,
      note: `Reported ${formatDate(item.firstReportedAt)} by ${item.firstReportedBy}${
        item.sightings > 1 ? ` · seen on ${item.sightings} checks` : ""
      }`,
      sourceReportId: item.sourceReportId,
      reported: true as const,
    }));
}
