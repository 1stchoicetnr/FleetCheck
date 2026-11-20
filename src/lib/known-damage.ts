import { DAMAGE_SIDES } from "./inspection-form.ts";
import type { CheckoutInspectionForm } from "./inspection-form.ts";
import { cleanDamageNote } from "./photo-flags.ts";
import { SIDE_PHOTO_ANGLE } from "./damage-before-after.ts";
import { PHOTO_ANGLES } from "./types.ts";
import type { PhotoAngle, VehiclePhoto } from "./types.ts";

/**
 * Known damage on a unit. Office marks a damage report "Known – not fixing" or
 * "Fix later". Drivers then answer "Same as before" or "New damage" on that
 * photo slot; "Same" sends no alert. It stays until office marks it Repaired.
 */
export type KnownDamageStatus = "not_fixing" | "fix_later";
export type KnownDamageAnswer = "same" | "new";
export type DamageReviewKind = "false_report" | "missed_damage";

export const KNOWN_DAMAGE_STATUS_LABELS: Record<KnownDamageStatus, string> = {
  not_fixing: "Known – not fixing",
  fix_later: "Fix later",
};

export interface KnownDamage {
  id: string;
  vehicleId: string;
  angle: PhotoAngle;
  description: string;
  status: KnownDamageStatus;
  note?: string;
  /** YYYY-MM-DD, Pacific. Fix later only. */
  targetDate?: string;
  /** The check whose photo shows it. Photo loads via /api/checkout-reports/:id/photos/:angle. */
  sourceReportId?: string;
  sourceAlertId?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  repairedAt?: string;
  repairedBy?: string;
}

/** Office review of a driver's answer on one photo. Counted in the driver tally. */
export interface DamageReviewMark {
  kind: DamageReviewKind;
  by: string;
  at: string;
}

export const KNOWN_DAMAGE_TEXT_MAX = 500;

const ANGLES = new Set<string>(PHOTO_ANGLES.map((step) => step.angle));

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim().slice(0, KNOWN_DAMAGE_TEXT_MAX);
  return text || undefined;
}

export function isYmd(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isActiveKnownDamage(item: Pick<KnownDamage, "repairedAt">): boolean {
  return !item.repairedAt;
}

export function activeKnownDamage<T extends Pick<KnownDamage, "repairedAt">>(list: readonly T[] | undefined): T[] {
  return (list ?? []).filter(isActiveKnownDamage);
}

/** Newest active known damage on a photo slot. */
export function knownDamageForAngle(
  list: readonly KnownDamage[] | undefined,
  angle: PhotoAngle | string
): KnownDamage | undefined {
  return activeKnownDamage(list)
    .filter((item) => item.angle === angle)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

/** Today's date in Pacific time, YYYY-MM-DD. */
export function pacificYmd(now: Date = new Date()): string {
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

export function isOverdue(item: Pick<KnownDamage, "status" | "targetDate" | "repairedAt">, today: string): boolean {
  return Boolean(
    item.status === "fix_later" && !item.repairedAt && item.targetDate && item.targetDate < today
  );
}

/** Active "Fix later" items, soonest target first (no date last), with an overdue flag. */
export function fixLaterList<T extends KnownDamage>(
  list: readonly T[] | undefined,
  today: string
): Array<T & { overdue: boolean }> {
  return activeKnownDamage(list)
    .filter((item) => item.status === "fix_later")
    .sort((a, b) => {
      if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
      if (a.targetDate) return -1;
      if (b.targetDate) return 1;
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    })
    .map((item) => ({ ...item, overdue: isOverdue(item, today) }));
}

export function fixLaterCounts(list: readonly KnownDamage[] | undefined, today: string): {
  fixLater: number;
  overdue: number;
} {
  const items = fixLaterList(list, today);
  return { fixLater: items.length, overdue: items.filter((item) => item.overdue).length };
}

export type KnownDamageInput = {
  angle: PhotoAngle;
  description: string;
  status: KnownDamageStatus;
  note?: string;
  targetDate?: string;
  sourceReportId?: string;
  sourceAlertId?: string;
};

/** Validate an office "mark as known" request. Returns an error message or the clean input. */
export function cleanKnownDamageInput(body: unknown): KnownDamageInput | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>;
  const angle = typeof input.angle === "string" && ANGLES.has(input.angle) ? (input.angle as PhotoAngle) : null;
  if (!angle) return { error: "Choose the photo slot." };
  const status = input.status === "not_fixing" || input.status === "fix_later" ? input.status : null;
  if (!status) return { error: "Choose Known – not fixing or Fix later." };
  const description = cleanText(input.description);
  if (!description) return { error: "Describe the damage." };
  const note = cleanText(input.note);
  let targetDate: string | undefined;
  if (input.targetDate != null && input.targetDate !== "") {
    if (!isYmd(input.targetDate)) return { error: "Target date must be a date." };
    targetDate = status === "fix_later" ? input.targetDate : undefined;
  }
  return {
    angle,
    description,
    status,
    ...(note ? { note } : {}),
    ...(targetDate ? { targetDate } : {}),
    ...(typeof input.sourceReportId === "string" && input.sourceReportId ? { sourceReportId: input.sourceReportId } : {}),
    ...(typeof input.sourceAlertId === "string" && input.sourceAlertId ? { sourceAlertId: input.sourceAlertId } : {}),
  };
}

export type KnownDamagePatch = {
  status?: KnownDamageStatus;
  note?: string | null;
  targetDate?: string | null;
  repaired?: boolean;
};

export function cleanKnownDamagePatch(body: unknown): KnownDamagePatch | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>;
  const patch: KnownDamagePatch = {};
  if (input.status !== undefined) {
    if (input.status !== "not_fixing" && input.status !== "fix_later") return { error: "Unknown status." };
    patch.status = input.status;
  }
  if (input.note !== undefined) patch.note = cleanText(input.note) ?? null;
  if (input.targetDate !== undefined) {
    if (input.targetDate === null || input.targetDate === "") patch.targetDate = null;
    else if (isYmd(input.targetDate)) patch.targetDate = input.targetDate;
    else return { error: "Target date must be a date." };
  }
  if (input.repaired !== undefined) {
    if (input.repaired !== true) return { error: "repaired can only be true." };
    patch.repaired = true;
  }
  if (!Object.keys(patch).length) return { error: "Nothing to change." };
  return patch;
}

export function applyKnownDamagePatch(item: KnownDamage, patch: KnownDamagePatch, by: string, at: string): KnownDamage {
  const next: KnownDamage = { ...item, updatedAt: at, updatedBy: by };
  if (patch.status) next.status = patch.status;
  if (patch.note !== undefined) {
    if (patch.note) next.note = patch.note;
    else delete next.note;
  }
  if (patch.targetDate !== undefined) {
    if (patch.targetDate) next.targetDate = patch.targetDate;
    else delete next.targetDate;
  }
  if (next.status !== "fix_later") delete next.targetDate;
  if (patch.repaired && !next.repairedAt) {
    next.repairedAt = at;
    next.repairedBy = by;
  }
  return next;
}

/** Parse a stored list; drops anything malformed. */
export function parseKnownDamageList(value: unknown, vehicleId: string): KnownDamage[] {
  let list = value;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.filter(
    (item): item is KnownDamage =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.angle === "string" &&
      typeof item.description === "string" &&
      (item.status === "not_fixing" || item.status === "fix_later")
  ).map((item) => ({ ...item, vehicleId }));
}

// --- Driver answers on photos ------------------------------------------------

export type KnownDamagePhotoFields = {
  knownDamageId?: string;
  knownDamageAnswer?: KnownDamageAnswer;
  knownDamageAnsweredAt?: string;
};

/** Fields kept on a photo. Only a real answer with an id is kept; older phones send none. */
export function knownDamageFields(input?: {
  knownDamageId?: unknown;
  knownDamageAnswer?: unknown;
  knownDamageAnsweredAt?: unknown;
}): KnownDamagePhotoFields {
  const id = typeof input?.knownDamageId === "string" ? input.knownDamageId.trim().slice(0, 80) : "";
  const answer = input?.knownDamageAnswer === "same" || input?.knownDamageAnswer === "new" ? input.knownDamageAnswer : null;
  if (!id || !answer) return {};
  const at =
    typeof input?.knownDamageAnsweredAt === "string" && !Number.isNaN(Date.parse(input.knownDamageAnsweredAt))
      ? new Date(input.knownDamageAnsweredAt).toISOString()
      : undefined;
  return { knownDamageId: id, knownDamageAnswer: answer, ...(at ? { knownDamageAnsweredAt: at } : {}) };
}

type AnswerPhoto = Pick<VehiclePhoto, "angle" | "flaggedDamage"> & KnownDamagePhotoFields & {
  damageReview?: DamageReviewMark;
};

/**
 * Slots where the driver said "Same as before" and office has not overruled it.
 * A photo the driver (or office) still flagged as damage is not "same".
 */
export function sameAsBeforeAngles(photos: readonly AnswerPhoto[]): Set<string> {
  return new Set(
    photos
      .filter(
        (photo) =>
          photo.knownDamageAnswer === "same" &&
          !photo.flaggedDamage &&
          photo.damageReview?.kind !== "missed_damage"
      )
      .map((photo) => photo.angle)
  );
}

/**
 * The check as alerts should see it: damage on a slot the driver confirmed as
 * known ("Same as before") is left out, including the matching Precheck side
 * note or mark. Checks with no answers come back unchanged (legacy behavior).
 */
export function withoutKnownDamage<
  T extends { photos: readonly AnswerPhoto[]; inspectionForm?: CheckoutInspectionForm | null }
>(report: T): T {
  const same = sameAsBeforeAngles(report.photos);
  if (!same.size) return report;
  const form = report.inspectionForm;
  if (!form?.damage) return report;
  const damage = { ...form.damage };
  let changed = false;
  for (const side of DAMAGE_SIDES) {
    if (!same.has(SIDE_PHOTO_ANGLE[side.id])) continue;
    if (cleanDamageNote(damage[side.id])) {
      damage[side.id] = "";
      changed = true;
    }
    if (damage.marks?.includes(side.id)) {
      damage.marks = damage.marks.filter((mark) => mark !== side.id);
      changed = true;
    }
  }
  return changed ? { ...report, inspectionForm: { ...form, damage } } : report;
}

/** The known damage the driver answered about on each photo of a check (for the check page and PDF). */
export function knownDamageAnswers<P extends AnswerPhoto>(
  photos: readonly P[],
  known: readonly KnownDamage[]
): Array<{ photo: P; known?: KnownDamage }> {
  return photos
    .filter((photo) => photo.knownDamageId && photo.knownDamageAnswer)
    .map((photo) => ({ photo, known: known.find((item) => item.id === photo.knownDamageId) }));
}

export function answerLabel(answer?: KnownDamageAnswer): string {
  if (answer === "same") return "Same as before";
  if (answer === "new") return "New damage";
  return "";
}

/**
 * Office verdict on a driver's answer:
 * - "not_new" on a New answer: closes the alert, false-report mark on the driver.
 * - "actually_new" on a Same answer: creates the alert, missed-damage mark on the driver.
 */
export function reviewMarkFor(
  photo: AnswerPhoto,
  verdict: "not_new" | "actually_new"
): DamageReviewKind | { error: string } {
  if (verdict === "not_new") {
    if (!photo.flaggedDamage && photo.knownDamageAnswer !== "new") {
      return { error: "Only a photo reported as new damage can be marked Not new." };
    }
    return "false_report";
  }
  if (photo.knownDamageAnswer !== "same") {
    return { error: "Only a Same as before answer can be marked Actually new." };
  }
  return "missed_damage";
}

// --- Weekly spot check -------------------------------------------------------

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A few random "Same as before" answers for office to look at side by side.
 * Random but stable for the week, so a reload shows the same list.
 */
export function spotCheckPicks<T extends { key: string }>(items: readonly T[], weekKey: string, count = 5): T[] {
  return [...items]
    .sort((a, b) => hash(`${weekKey}:${a.key}`) - hash(`${weekKey}:${b.key}`) || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, count));
}
