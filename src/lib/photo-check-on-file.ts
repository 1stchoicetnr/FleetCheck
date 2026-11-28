import { damageDescriptionsMatch, type OnFileDamage } from "./on-file-damage.ts";

/**
 * A photo-check finding is already on file when this unit already has the
 * same damage: known (not fixing or fix later), reported and not reviewed,
 * or a photo-check finding the office already confirmed, dismissed, or
 * marked already known. Same vehicle, same photo slot or the same body
 * area, and similar wording (the on-file matcher). A different spot still
 * raises. Another unit never suppresses this one.
 */

/** Slots that photograph the same part of the car. */
const PHOTO_BODY_AREA: Record<string, string> = {
  front: "front",
  lf_corner: "left_front",
  lf_fender: "left_front",
  rf_corner: "right_front",
  rf_fender: "right_front",
  rear: "rear",
  lr_corner: "left_rear",
  lr_quarter_panel: "left_rear",
  rr_corner: "right_rear",
  rr_quarter_panel: "right_rear",
  driver_doors: "driver_side",
  passenger_doors: "passenger_side",
};

export function photoBodyArea(angle: string): string {
  return PHOTO_BODY_AREA[angle] ?? angle;
}

/**
 * The vision model is asked to describe what is new versus the earlier photo,
 * so summaries often start with "new". That word means "a change from the
 * baseline", not "worse than the damage already on file".
 */
function summaryForMatch(summary: string): string {
  return summary.replace(/\bnew\b/gi, " ").replace(/\s+/g, " ").trim();
}

export function findingMatchesOnFile(
  finding: { vehicleId: string; angle: string; summary: string },
  onFile: { vehicleId: string; angle: string; description: string }
): boolean {
  if (finding.vehicleId !== onFile.vehicleId) return false;
  const summary = summaryForMatch(finding.summary);
  if (!summary || !onFile.description.trim()) return false;
  const sameSpot = finding.angle === onFile.angle || photoBodyArea(finding.angle) === photoBodyArea(onFile.angle);
  if (!sameSpot) return false;
  return damageDescriptionsMatch(summary, onFile.description);
}

const DECIDED = new Set(["confirmed", "dismissed", "already_known"]);

/** Office decisions on earlier photo-check findings for this unit. */
export function priorPhotoCheckDecisions(
  history: readonly {
    id: string;
    completedAt: string;
    photos: readonly {
      angle: string;
      photoCheck?: { summary?: string; review?: { verdict?: string } };
    }[];
  }[],
  currentReportId: string,
  asOf: string
): Array<{ angle: string; summary: string }> {
  const now = Date.parse(asOf);
  const out: Array<{ angle: string; summary: string }> = [];
  for (const check of history) {
    if (check.id === currentReportId) continue;
    const at = Date.parse(check.completedAt);
    if (!Number.isFinite(at) || (Number.isFinite(now) && at > now)) continue;
    for (const photo of check.photos) {
      const verdict = photo.photoCheck?.review?.verdict;
      const summary = photo.photoCheck?.summary?.trim();
      if (!verdict || !DECIDED.has(verdict) || !summary) continue;
      out.push({ angle: photo.angle, summary });
    }
  }
  return out;
}

/** Angles that should be saved on the check and not raised as an alert. */
export function suppressPhotoFindings(input: {
  vehicleId: string;
  findings: readonly { angle: string; summary: string }[];
  /** This unit's on-file damage. `vehicleId` on an item wins when a list mixes units. */
  onFile: readonly (OnFileDamage & { vehicleId?: string })[];
  decisions: readonly { angle: string; summary: string }[];
}): string[] {
  const out: string[] = [];
  for (const finding of input.findings) {
    const current = { vehicleId: input.vehicleId, angle: finding.angle, summary: finding.summary };
    const onFileHit = input.onFile.some((item) =>
      [item.description, ...(item.alsoKnownAs ?? [])].some((description) =>
        findingMatchesOnFile(current, {
          vehicleId: item.vehicleId ?? input.vehicleId,
          angle: item.angle,
          description,
        })
      )
    );
    const decisionHit = input.decisions.some((decision) =>
      findingMatchesOnFile(current, {
        vehicleId: input.vehicleId,
        angle: decision.angle,
        description: decision.summary,
      })
    );
    if (onFileHit || decisionHit) out.push(finding.angle);
  }
  return out;
}

/**
 * The Already known button should not add a second copy of the same slot.
 * Exact wording always counts, including summaries the matcher treats as new.
 */
export function activeKnownCovers(
  list: readonly { angle: string; description: string; repairedAt?: string; sourceReportId?: string }[],
  input: { angle: string; description: string; sourceReportId?: string }
): boolean {
  const want = input.description.trim().toLowerCase();
  return list.some((item) => {
    if (item.repairedAt || item.angle !== input.angle) return false;
    if (input.sourceReportId && item.sourceReportId === input.sourceReportId) return true;
    if (item.description.trim().toLowerCase() === want) return true;
    return damageDescriptionsMatch(input.description, item.description);
  });
}
