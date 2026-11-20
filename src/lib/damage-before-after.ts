import { damageItemKeys, damageKeyArea, type DamageKeySource } from "./damage-keys.ts";
import { photoAngleLabel } from "./photo-flags.ts";
import { clientPhotoSrc } from "./photo-url.ts";
import type { PhotoAngle, VehiclePhoto } from "./types.ts";

/** Photo slot that shows each inspection-form damage side. */
export const SIDE_PHOTO_ANGLE: Record<string, PhotoAngle> = {
  front: "front",
  rear: "rear",
  left: "driver_doors",
  right: "passenger_doors",
};

export interface CompareReport extends DamageKeySource {
  id: string;
  completedAt: string;
  driverName: string;
  photos: ReadonlyArray<Pick<VehiclePhoto, "angle" | "flaggedDamage" | "damageNote" | "dataUrl"> & { damageSpot?: { x: number; y: number } }>;
}

export interface BeforeAfterPhoto {
  reportId: string;
  /** Browser address through the app's signed-in photo route. Never a public blob URL. */
  src: string;
  /** Stored address, server only (PDF embedding). Stripped before JSON goes to the browser. */
  stored?: string;
  completedAt: string;
  driverName: string;
}

export interface BeforeAfterPair {
  angle: PhotoAngle;
  label: string;
  after?: BeforeAfterPhoto;
  /** Latest earlier check of this unit that has this photo slot. Missing = "No earlier photo". */
  before?: BeforeAfterPhoto;
  /** The after photo is the driver's damage close-up (not the walkaround shot). */
  afterIsCloseUp?: boolean;
  /** Driver's tap on the car diagram. */
  spot?: { x: number; y: number };
}

/** Photo slots to compare for these damage items, in item order, no repeats. */
export function damageCompareAngles(keys: readonly string[]): PhotoAngle[] {
  const angles: PhotoAngle[] = [];
  for (const key of keys) {
    const area = damageKeyArea(key);
    if (!area) continue;
    const angle = (SIDE_PHOTO_ANGLE[area] ?? area) as PhotoAngle;
    if (!angles.includes(angle)) angles.push(angle);
  }
  return angles;
}

function photoOf(report: CompareReport, angle: PhotoAngle, keepStored: boolean): BeforeAfterPhoto | undefined {
  const photo = report.photos.find((p) => p.angle === angle && p.dataUrl);
  if (!photo?.dataUrl) return undefined;
  return {
    reportId: report.id,
    src: clientPhotoSrc(report.id, photo.angle, photo.dataUrl),
    ...(keepStored ? { stored: photo.dataUrl } : {}),
    completedAt: report.completedAt,
    driverName: report.driverName,
  };
}

/**
 * Before / after for a damage report: for each damaged slot, this check's photo
 * (after) and the same slot from the unit's most recent earlier check that has
 * it (before). `history` is the unit's other checks in any order; later checks
 * are ignored. `keys` limits it to one alert's items.
 */
export function beforeAfterPairs(
  report: CompareReport,
  history: readonly CompareReport[],
  options: { keys?: readonly string[] | null; keepStored?: boolean } = {}
): BeforeAfterPair[] {
  const keys = options.keys ?? damageItemKeys(report);
  const now = Date.parse(report.completedAt);
  const earlier = history
    .filter((item) => {
      if (item.id === report.id) return false;
      const time = Date.parse(item.completedAt);
      return Number.isFinite(time) && Number.isFinite(now) && time < now;
    })
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const keepStored = Boolean(options.keepStored);
  return damageCompareAngles(keys).map((angle) => {
    let before: BeforeAfterPhoto | undefined;
    for (const prior of earlier) {
      before = photoOf(prior, angle, keepStored);
      if (before) break;
    }
    // The required damage close-up is the "after" photo when there is one.
    const closeUp = photoOf(report, `closeup_${angle}` as PhotoAngle, keepStored);
    const spot = report.photos.find((p) => p.angle === angle)?.damageSpot;
    return {
      angle,
      label: photoAngleLabel(angle),
      after: closeUp ?? photoOf(report, angle, keepStored),
      before,
      ...(closeUp ? { afterIsCloseUp: true } : {}),
      ...(spot ? { spot } : {}),
    };
  });
}

/** Drop server-only stored addresses before sending pairs to the browser. */
export function pairsForClient(pairs: BeforeAfterPair[]): BeforeAfterPair[] {
  const strip = (photo?: BeforeAfterPhoto) => {
    if (!photo) return undefined;
    const { stored: _stored, ...rest } = photo;
    void _stored;
    return rest;
  };
  return pairs.map((pair) => ({ ...pair, before: strip(pair.before), after: strip(pair.after) }));
}

export function beforeCaption(pair: BeforeAfterPair, formatTime: (iso: string) => string): string {
  if (!pair.before) return "No earlier photo";
  return `Before · ${formatTime(pair.before.completedAt)} · ${pair.before.driverName}`;
}

/** Slack lines: one per damaged slot, linking the earlier check (sign-in required). */
export function beforeAfterSlackLines(
  pairs: BeforeAfterPair[],
  checkUrl: (reportId: string) => string,
  formatTime: (iso: string) => string
): string[] {
  if (!pairs.length) return [];
  return [
    "*Before / after:*",
    ...pairs.map((pair) => {
      const before = pair.before
        ? `<${checkUrl(pair.before.reportId)}|Before · ${formatTime(pair.before.completedAt)} · ${pair.before.driverName}>`
        : "No earlier photo";
      const where = spotText(pair.spot);
      const after = pair.after
        ? `After: ${pair.afterIsCloseUp ? "close-up on this check" : "this check"}${where ? ` · ${where}` : ""}`
        : "After: no photo on this check";
      return `• ${pair.label}: ${before} | ${after}`;
    }),
  ];
}

/** "front left", "rear center" from the diagram tap (front of car at y = 0). */
export function spotText(spot?: { x: number; y: number }): string | undefined {
  if (!spot) return undefined;
  const along = spot.y < 0.33 ? "front" : spot.y > 0.67 ? "rear" : "middle";
  const across = spot.x < 0.36 ? "left" : spot.x > 0.64 ? "right" : "center";
  if (along === "middle" && across === "center") return "roof / center";
  return `${along} ${across}`;
}
