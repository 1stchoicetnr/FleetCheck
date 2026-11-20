import { DAMAGE_SIDES, ISSUE_FLAG_ITEMS } from "./inspection-form.ts";
import type { CheckoutInspectionForm, DamageSide } from "./inspection-form.ts";
import { cleanDamageNote, isPhotoDamageFlagged } from "./photo-flags.ts";
import type { PhotoAngle, VehiclePhoto } from "./types.ts";

/**
 * One damage item on a check, keyed by area + item. The area part picks the
 * photo slot for before/after photos.
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
