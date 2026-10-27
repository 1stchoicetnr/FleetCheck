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

export function damageActor(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed || "Driver";
}

/** Angle name, the driver who marked it, and the optional note. */
export function damageFlagText(
  photo: Pick<VehiclePhoto, "angle" | "damageNote">,
  driverName?: string | null
): string {
  const label = photoAngleLabel(photo.angle);
  const note = cleanDamageNote(photo.damageNote);
  const head = `${label} · ${damageActor(driverName)}`;
  return note ? `${head}: ${note}` : head;
}

/** A silhouette side, always named, with the note or the word marked. */
export function damageSideLine(
  label: string,
  note?: string | null,
  driverName?: string | null
): string {
  const head = `${label} · ${damageActor(driverName)}`;
  const clean = cleanDamageNote(note);
  return clean ? `${head}: ${clean}` : `${head}: marked`;
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
