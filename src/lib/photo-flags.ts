import { PHOTO_ANGLES } from "./types.ts";
import type { CheckoutReport, PhotoAngle, VehiclePhoto } from "./types.ts";

export function isPhotoDamageFlagged(photo?: Pick<VehiclePhoto, "flaggedDamage"> | null): boolean {
  return Boolean(photo?.flaggedDamage);
}

export function reportHasPhotoDamage(report: Pick<CheckoutReport, "photos">): boolean {
  return report.photos.some((photo) => isPhotoDamageFlagged(photo));
}

export function photoAngleLabel(angle: PhotoAngle): string {
  return PHOTO_ANGLES.find((step) => step.angle === angle)?.label ?? angle;
}

export function flaggedDamageAngles(report: Pick<CheckoutReport, "photos">): PhotoAngle[] {
  return report.photos.filter(isPhotoDamageFlagged).map((photo) => photo.angle);
}

export const DAMAGE_NOTE_MAX = 500;

export function cleanDamageNote(note?: string | null): string | undefined {
  const trimmed = note?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, DAMAGE_NOTE_MAX);
}

/** Angle name plus the optional driver/office note. */
export function damageFlagText(
  photo: Pick<VehiclePhoto, "angle" | "damageNote">
): string {
  const label = photoAngleLabel(photo.angle);
  const note = cleanDamageNote(photo.damageNote);
  return note ? `${label} — ${note}` : label;
}

/** Empty string clears a note. Omitted keeps the previous note. Unflagging always clears it. */
export function resolveDamageNote(
  flaggedDamage: boolean,
  incoming: string | undefined,
  previous?: string | null
): string | undefined {
  if (!flaggedDamage) return undefined;
  if (incoming === undefined) return cleanDamageNote(previous);
  return cleanDamageNote(incoming);
}

export function sortAnglesDamageFirst<T extends { angle: PhotoAngle }>(
  items: T[],
  photos: VehiclePhoto[]
): T[] {
  const flagged = new Set(
    photos.filter(isPhotoDamageFlagged).map((photo) => photo.angle)
  );
  return [...items].sort((a, b) => {
    const aFlag = flagged.has(a.angle) ? 0 : 1;
    const bFlag = flagged.has(b.angle) ? 0 : 1;
    if (aFlag !== bFlag) return aFlag - bFlag;
    return items.indexOf(a) - items.indexOf(b);
  });
}
