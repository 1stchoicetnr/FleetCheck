import { CheckoutReport, PHOTO_ANGLES, PhotoAngle, VehiclePhoto } from "./types";

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
