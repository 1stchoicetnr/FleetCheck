import { damageItemKeys } from "./damage-keys.ts";
import { damageCompareAngles } from "./damage-before-after.ts";
import { cleanKnownDamageInput, withoutKnownDamage, type KnownDamageInput } from "./known-damage.ts";
import { normalizeChangeBox, type ChangeBox } from "./photo-box.ts";
import { normalizePlate } from "./plate.ts";
import type { PhotoAngle, VehiclePhoto } from "./types.ts";

export type { ChangeBox };

/**
 * Bot photo check: after a check, compare each outside photo slot with the
 * unit's last clean photo of that slot (or the known-damage photo when the
 * slot has known damage) using a vision model through Vercel AI Gateway.
 * A likely change goes to the office queue ONLY ("Found by photo check") with
 * Confirm, Already known, or Dismiss. Confirm queues Rad Cab damage for the
 * daily digest. Already known and Dismiss send nothing. A finding that
 * matches damage already on file is not raised.
 * Off by default; a monthly spend cap stops calls for the rest of the month.
 */

export const PHOTO_CHECK_MODEL = "google/gemini-2.5-flash";
/** USD per token, from the AI Gateway model list (Nov 2026). Used only when the gateway does not report cost. */
export const PHOTO_CHECK_PRICE = { input: 0.0000003, output: 0.0000025 };
export const PHOTO_CHECK_DEFAULT_CAP_USD = 10;
export const PHOTO_CHECK_CAP_MAX_USD = 500;
/** Below this, a "changed" answer is ignored. */
export const PHOTO_CHECK_MIN_CONFIDENCE = 0.6;

/** Outside body slots only. Interior, tires, documents, and the odometer are skipped. */
export const PHOTO_CHECK_SLOTS: readonly PhotoAngle[] = [
  "front",
  "rear",
  "driver_doors",
  "passenger_doors",
  "lf_corner",
  "rf_corner",
  "lr_corner",
  "rr_corner",
  "lf_fender",
  "rf_fender",
  "lr_quarter_panel",
  "rr_quarter_panel",
];

export interface PhotoCheckSettings {
  enabled: boolean;
  monthlyCapUsd: number;
}

export function cleanPhotoCheckSettings(value: unknown): PhotoCheckSettings {
  const v = (value && typeof value === "object" ? value : {}) as { enabled?: unknown; monthlyCapUsd?: unknown };
  const cap = typeof v.monthlyCapUsd === "number" && Number.isFinite(v.monthlyCapUsd) ? v.monthlyCapUsd : PHOTO_CHECK_DEFAULT_CAP_USD;
  return {
    enabled: v.enabled === true,
    monthlyCapUsd: Math.min(PHOTO_CHECK_CAP_MAX_USD, Math.max(0, Math.round(cap * 100) / 100)),
  };
}

export interface PhotoCheckResult {
  changed: boolean;
  confidence: number;
  summary: string;
  box?: ChangeBox;
  againstReportId: string;
  againstKind: "clean" | "known";
  model: string;
  costUsd: number;
  at: string;
  error?: string;
  /** Set when the finding matched damage already on file. It is not raised. */
  onFile?: "already_on_file";
  /** Office decision on a "Found by photo check" alert. */
  review?: { verdict: "confirmed" | "dismissed" | "already_known"; by: string; at: string };
}

/** Shown on the check when a finding matched damage already on file. */
export const PHOTO_CHECK_ON_FILE_NOTE = "Photo check: already on file";

export type PhotoCheckOfficeVerdict = "confirm" | "dismiss" | "already_known";

export function photoCheckOfficeDecision(verdict: PhotoCheckOfficeVerdict): {
  review: "confirmed" | "dismissed" | "already_known";
  /** Flag the photo and queue the repair digest, the same as other confirmed damage. */
  flagDamage: boolean;
  queueAlert: boolean;
  /** Add Known – not fixing. No Slack and no digest. */
  markKnown: boolean;
} {
  switch (verdict) {
    case "confirm":
      return { review: "confirmed", flagDamage: true, queueAlert: true, markKnown: false };
    case "dismiss":
      return { review: "dismissed", flagDamage: false, queueAlert: false, markKnown: false };
    case "already_known":
      return { review: "already_known", flagDamage: false, queueAlert: false, markKnown: true };
    default: {
      const neverVerdict: never = verdict;
      return neverVerdict;
    }
  }
}

/** Known – not fixing row for the Already known button. */
export function knownNotFixingFromFinding(input: {
  angle: string;
  summary: string;
  reportId: string;
  alertId: string;
}): KnownDamageInput | { error: string } {
  const description = input.summary.replace(/\s+/g, " ").trim().slice(0, 500) || "Damage";
  return cleanKnownDamageInput({
    angle: input.angle,
    description,
    status: "not_fixing",
    sourceReportId: input.reportId,
    sourceAlertId: input.alertId,
  });
}

type HistoryPhoto = Pick<VehiclePhoto, "angle" | "dataUrl" | "flaggedDamage" | "damageNote"> & {
  knownDamageAnswer?: "same" | "new";
  knownDamageId?: string;
  damageReview?: { kind: "false_report" | "missed_damage"; by: string; at: string };
  photoCheck?: PhotoCheckResult;
};

export interface HistoryCheck {
  id: string;
  /** Set on a stored check. Two checks compare only when this matches. */
  vehicleId?: string;
  completedAt: string;
  driverName: string;
  photos: readonly HistoryPhoto[];
  inspectionForm?: import("./inspection-form.ts").CheckoutInspectionForm | null;
}

/** Same unit. A check with no vehicle id only matches another check that also has none. */
export function sameVehicle(a: { vehicleId?: string }, b: { vehicleId?: string }): boolean {
  if (a.vehicleId && b.vehicleId) return a.vehicleId === b.vehicleId;
  return !a.vehicleId && !b.vehicleId;
}

export interface Baseline {
  reportId: string;
  dataUrl: string;
  completedAt: string;
  driverName: string;
  kind: "clean" | "known";
}

/** The latest earlier check where this slot was photographed with no new damage. */
export function lastCleanPhoto(report: HistoryCheck, history: readonly HistoryCheck[], angle: PhotoAngle): Baseline | undefined {
  const now = Date.parse(report.completedAt);
  const earlier = history
    .filter((c) => c.id !== report.id && Date.parse(c.completedAt) < now)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  for (const check of earlier) {
    if (!sameVehicle(report, check)) continue;
    const photo = check.photos.find((p) => p.angle === angle && p.dataUrl);
    if (!photo) continue;
    const damaged = damageCompareAngles(damageItemKeys(withoutKnownDamage(check)));
    const confirmedByBot = photo.photoCheck?.review?.verdict === "confirmed";
    if (damaged.includes(angle) || confirmedByBot) continue;
    return { reportId: check.id, dataUrl: photo.dataUrl, completedAt: check.completedAt, driverName: check.driverName, kind: "clean" };
  }
  return undefined;
}

/**
 * Slots to check on this report, with what to compare against. Slots the
 * driver already reported as damage are skipped (they already alert), and so
 * are slots that already have a result.
 */
export function photoCheckPlan(
  report: HistoryCheck,
  history: readonly HistoryCheck[],
  known: ReadonlyArray<{ angle: PhotoAngle; sourceReportId?: string; repairedAt?: string }>
): Array<{ angle: PhotoAngle; after: string; baseline: Baseline }> {
  const reported = new Set(damageCompareAngles(damageItemKeys(withoutKnownDamage(report))));
  const plan: Array<{ angle: PhotoAngle; after: string; baseline: Baseline }> = [];
  for (const angle of PHOTO_CHECK_SLOTS) {
    const photo = report.photos.find((p) => p.angle === angle && p.dataUrl);
    if (!photo || photo.photoCheck || reported.has(angle)) continue;
    const knownItem = known.find((k) => k.angle === angle && !k.repairedAt && k.sourceReportId);
    let baseline: Baseline | undefined;
    if (knownItem) {
      const source = history.find((c) => c.id === knownItem.sourceReportId && sameVehicle(report, c));
      const knownPhoto = source?.photos.find((p) => p.angle === angle && p.dataUrl);
      if (source && knownPhoto) {
        baseline = { reportId: source.id, dataUrl: knownPhoto.dataUrl, completedAt: source.completedAt, driverName: source.driverName, kind: "known" };
      }
    }
    baseline ??= lastCleanPhoto(report, history, angle);
    if (baseline) plan.push({ angle, after: photo.dataUrl, baseline });
  }
  return plan;
}

export const PHOTO_CHECK_PROMPT = [
  "You compare two photos of the same taxi, same camera position, taken on different days.",
  "Image 1 is BEFORE (known condition). Image 2 is AFTER (today).",
  "Report only NEW physical body damage visible in AFTER that is not in BEFORE: dents, scrapes, cracks, broken lights or mirrors, missing parts, bumper hanging.",
  "Ignore lighting, angle, reflections, rain, dirt, snow, shadows, background, photo date stamps, and damage that already shows in BEFORE.",
  "box is null, or the new damage on AFTER only. x is the left edge, y is the top edge, w is the width, h is the height. Each number is a fraction from 0 to 1 of that photo. The top-left corner is 0,0. Do not use pixels, a 0 to 1000 scale, or ymin, xmin, ymax, xmax.",
  'seenPlate is the license plate you can read on AFTER, or "". seenUnit is the unit-number sticker on AFTER, digits only, or "". Leave both empty when you cannot read them. Do not guess, and do not copy them from BEFORE.',
  'Answer JSON only: {"changed": boolean, "confidence": number 0..1, "summary": short plain words (max 12 words), "box": {"x","y","w","h"} or null, "seenPlate": string, "seenUnit": string}.',
].join(" ");

export const PHOTO_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["changed", "confidence", "summary", "box", "seenPlate", "seenUnit"],
  properties: {
    changed: { type: "boolean" },
    confidence: { type: "number" },
    summary: { type: "string" },
    seenPlate: { type: "string" },
    seenUnit: { type: "string" },
    box: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["x", "y", "w", "h"],
          properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
        },
      ],
    },
  },
} as const;

const unit = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : NaN;

/** Model answer -> verdict. Anything unreadable counts as "no change" so nothing false goes to the office. */
export function parseVerdict(text: string): {
  changed: boolean;
  confidence: number;
  summary: string;
  box?: ChangeBox;
  seenPlate?: string;
  seenUnit?: string;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { changed: false, confidence: 0, summary: "Unreadable answer" };
  }
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const confidence = Number.isNaN(unit(v.confidence)) ? 0 : unit(v.confidence);
  const summary = typeof v.summary === "string" ? v.summary.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const box = normalizeChangeBox(v.box);
  const seenPlate = typeof v.seenPlate === "string" ? v.seenPlate.trim().slice(0, 32) : "";
  const seenUnit = typeof v.seenUnit === "string" ? v.seenUnit.trim().slice(0, 16) : "";
  return {
    changed: v.changed === true && confidence >= PHOTO_CHECK_MIN_CONFIDENCE,
    confidence: Math.round(confidence * 100) / 100,
    summary: summary || (v.changed === true ? "Possible new damage" : "No change"),
    ...(box ? { box } : {}),
    ...(seenPlate ? { seenPlate } : {}),
    ...(seenUnit ? { seenUnit } : {}),
  };
}

export interface SeenMark {
  plate: string;
  unit: string;
}

/** Digits of a unit sticker. "05" and "#5" are the same unit. A plate is not a unit. */
export function unitKey(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || /[A-Za-z]/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits || digits.length > 3) return null;
  const n = Number(digits);
  if (!Number.isInteger(n)) return null;
  return String(n);
}

/** A license plate, letters and numbers, ignoring spaces and hyphens. */
export function plateKey(value: string | undefined): string | null {
  const norm = normalizePlate(value ?? "");
  if (norm.length < 5 || norm.length > 8) return null;
  if (!/[A-Z]/.test(norm) || !/[0-9]/.test(norm)) return null;
  return norm;
}

/**
 * The AFTER photos show a different unit. Empty reads do not count.
 * One photo that matches this unit wins, so a misread does not hide real damage.
 */
export function differentUnitReading(
  expected: { unitNumber?: string; plate?: string },
  marks: readonly SeenMark[]
): { unit?: string; plate?: string } | null {
  const expectedPlate = plateKey(expected.plate);
  const expectedUnit = unitKey(expected.unitNumber?.replace(/^#/, ""));
  let agrees = false;
  let unit: string | undefined;
  let plate: string | undefined;
  for (const mark of marks) {
    const seenPlate = plateKey(mark.plate);
    const seenUnit = unitKey(mark.unit);
    if (seenPlate && expectedPlate && seenPlate === expectedPlate) agrees = true;
    if (seenUnit && expectedUnit && seenUnit === expectedUnit) agrees = true;
    if (seenPlate && expectedPlate && seenPlate !== expectedPlate) plate = seenPlate;
    if (seenUnit && expectedUnit && seenUnit !== expectedUnit) unit = seenUnit;
  }
  if (agrees || (!unit && !plate)) return null;
  return { ...(unit ? { unit } : {}), ...(plate ? { plate } : {}) };
}

/** Office alert when the new photos are a different car. Not a damage post. */
export function differentUnitAlertMessage(
  unitLabel: string,
  seen: { unit?: string; plate?: string }
): string {
  const which = seen.unit ? `#${seen.unit}?` : "another unit?";
  const plate = seen.plate ? ` The new photo shows plate ${seen.plate}.` : "";
  return `Photo looks like a different unit (${which}) on ${unitLabel}.${plate} Nothing was sent to Slack.`;
}

/** Cost of one call: the gateway's reported cost when present, else tokens x list price. */
export function callCostUsd(usage: unknown): number {
  const u = (usage && typeof usage === "object" ? usage : {}) as Record<string, unknown>;
  const reported = Number(u.cost ?? u.total_cost ?? NaN);
  if (Number.isFinite(reported) && reported >= 0) return reported;
  const input = Number(u.prompt_tokens ?? 0) || 0;
  const output = Number(u.completion_tokens ?? 0) || 0;
  return Math.round((input * PHOTO_CHECK_PRICE.input + output * PHOTO_CHECK_PRICE.output) * 1e6) / 1e6;
}

/** First instant of the current month in Pacific time, as ISO. */
export function pacificMonthStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const y = Number(parts.year);
  const m = Number(parts.month);
  // Midnight Pacific is 07:00 or 08:00 UTC; take the earlier so no call slips past the cap.
  return new Date(Date.UTC(y, m - 1, 1, 7, 0, 0)).toISOString();
}

export function underCap(spentUsd: number, settings: PhotoCheckSettings): boolean {
  return settings.enabled && spentUsd < settings.monthlyCapUsd;
}

/** "Found by photo check" alert text. */
export function photoCheckAlertMessage(unit: string, items: Array<{ label: string; summary: string; confidence: number }>): string {
  const parts = items.map((i) => `${i.label}: ${i.summary} (${Math.round(i.confidence * 100)}%)`);
  return `Found by photo check on ${unit}: ${parts.join("; ")}`;
}

/** Slots on a report the bot flagged and the office has not decided yet. */
export function openPhotoCheckFindings(photos: readonly HistoryPhoto[]): PhotoAngle[] {
  return photos.filter((p) => p.photoCheck?.changed && !p.photoCheck.review).map((p) => p.angle);
}
