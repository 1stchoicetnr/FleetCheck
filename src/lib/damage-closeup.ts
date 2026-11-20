import { DAMAGE_SIDES } from "./inspection-form.ts";
import type { CheckoutInspectionForm } from "./inspection-form.ts";
import { cleanDamageNote } from "./photo-flags.ts";
import { PHOTO_ANGLES } from "./types.ts";
import { spotText } from "./damage-before-after.ts";
import type { PhotoAngle, VehiclePhoto } from "./types.ts";

/**
 * Required damage close-up: when a driver flags damage on a photo slot (or
 * answers "New damage" on known damage, or noted damage on that side in the
 * Precheck), they must take a close-up and tap where it is on a car diagram.
 * The close-up is stored as its own photo, angle "closeup_<slot>", and becomes
 * the "after" photo in before/after.
 */

export const CLOSEUP_PREFIX = "closeup_";

/** Spot on the top-down car diagram. 0..1 from the left / from the front. */
export interface DamageSpot {
  x: number;
  y: number;
}

export function closeUpAngle(angle: PhotoAngle | string): PhotoAngle {
  return `${CLOSEUP_PREFIX}${angle}` as PhotoAngle;
}

export function isCloseUpAngle(angle: string): boolean {
  return angle.startsWith(CLOSEUP_PREFIX);
}

export function baseAngleOf(angle: string): PhotoAngle | undefined {
  if (!isCloseUpAngle(angle)) return undefined;
  const base = angle.slice(CLOSEUP_PREFIX.length);
  return PHOTO_ANGLES.some((step) => step.angle === base) ? (base as PhotoAngle) : undefined;
}

/** Upload check: a walkaround slot, or the close-up of one. */
export function isUploadAngle(angle: unknown): boolean {
  if (typeof angle !== "string") return false;
  if (PHOTO_ANGLES.some((step) => step.angle === angle)) return true;
  return Boolean(baseAngleOf(angle));
}

export function closeUpLabel(angle: string, label: (a: PhotoAngle) => string): string {
  const base = baseAngleOf(angle);
  return base ? `${label(base)} close-up` : angle;
}

/** Valid diagram spot, rounded to 3 places; anything else is dropped. */
export function cleanDamageSpot(value: unknown): DamageSpot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as { x?: unknown; y?: unknown };
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  if (!ok(v.x) || !ok(v.y)) return undefined;
  return { x: Math.round(v.x * 1000) / 1000, y: Math.round(v.y * 1000) / 1000 };
}

export function damageSpotFields(input?: { damageSpot?: unknown }): { damageSpot?: DamageSpot } {
  const spot = cleanDamageSpot(input?.damageSpot);
  return spot ? { damageSpot: spot } : {};
}

/** "front left", "rear center", "middle right". Front of the car is y = 0. */
export function damageSpotLabel(spot: DamageSpot | undefined): string | undefined {
  return spotText(spot);
}

/** Slot that shows each Precheck damage side. */
const SIDE_SLOT: Record<string, PhotoAngle> = {
  front: "front",
  rear: "rear",
  left: "driver_doors",
  right: "passenger_doors",
};

/** Photo slots the Precheck marked or noted as damaged. */
export function precheckDamageSlots(form?: CheckoutInspectionForm | null): PhotoAngle[] {
  const damage = form?.damage ?? {};
  const marks = new Set((damage.marks ?? []).map(String));
  const out: PhotoAngle[] = [];
  for (const side of DAMAGE_SIDES) {
    if (cleanDamageNote(damage[side.id]) || marks.has(side.id)) {
      const slot = SIDE_SLOT[side.id];
      if (slot && !out.includes(slot)) out.push(slot);
    }
  }
  return out;
}

type SlotFlags = {
  flaggedDamage?: boolean;
  knownDamageAnswer?: "same" | "new";
  damageSpot?: DamageSpot;
};

/** Does this slot need a close-up + diagram tap? Flagged damage, or Precheck damage the driver did not confirm as known "Same". */
export function needsCloseUp(angle: PhotoAngle, flags: SlotFlags | undefined, precheckSlots: readonly PhotoAngle[]): boolean {
  if (flags?.flaggedDamage) return true;
  if (!precheckSlots.includes(angle)) return false;
  return flags?.knownDamageAnswer !== "same";
}

/** What is still missing for this slot: the diagram tap, the close-up, both, or nothing. */
export function closeUpMissing(
  angle: PhotoAngle,
  flags: SlotFlags | undefined,
  photos: Partial<Record<string, string>>,
  precheckSlots: readonly PhotoAngle[]
): { spot: boolean; photo: boolean } | null {
  if (!needsCloseUp(angle, flags, precheckSlots)) return null;
  const spot = !cleanDamageSpot(flags?.damageSpot);
  const photo = !photos[closeUpAngle(angle)];
  return spot || photo ? { spot, photo } : null;
}

/** First accepted slot still missing its close-up or diagram tap (blocks finishing the photos). */
export function firstMissingCloseUp(
  angles: readonly PhotoAngle[],
  flags: Partial<Record<string, SlotFlags>> | undefined,
  photos: Partial<Record<string, string>>,
  precheckSlots: readonly PhotoAngle[]
): PhotoAngle | undefined {
  return angles.find((angle) => photos[angle] && closeUpMissing(angle, flags?.[angle], photos, precheckSlots));
}

/** The close-up photo on a check for this slot, if any. */
export function closeUpPhoto<T extends Pick<VehiclePhoto, "angle" | "dataUrl">>(
  photos: readonly T[],
  angle: PhotoAngle
): T | undefined {
  const id = closeUpAngle(angle);
  return photos.find((p) => p.angle === id && p.dataUrl);
}
