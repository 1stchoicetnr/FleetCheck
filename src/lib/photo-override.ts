import { PHOTO_ANGLES, type PhotoAngle } from "./types";

/** A quality warning the driver chose to keep the photo through. */
export type PhotoQualityOverride = "dark" | "blank" | "blur";

const OVERRIDES: PhotoQualityOverride[] = ["dark", "blank", "blur"];

export const OVERRIDE_REASON_MAX = 120;

/** Quick reasons a driver can tap. The first one for the warning is preselected. */
export const OVERRIDE_REASONS: Record<PhotoQualityOverride, string[]> = {
  dark: ["Too dark / night", "No light available", "Other"],
  blur: ["Couldn't hold steady", "Too dark / night", "Other"],
  blank: ["Camera problem", "Too dark / night", "Other"],
};

export function defaultOverrideReason(issue: PhotoQualityOverride): string {
  return OVERRIDE_REASONS[issue][0];
}

/** Server and storage: only a known warning counts. Anything else is dropped. */
export function cleanQualityOverride(value: unknown): PhotoQualityOverride | undefined {
  return typeof value === "string" && (OVERRIDES as string[]).includes(value)
    ? (value as PhotoQualityOverride)
    : undefined;
}

/** One short line: the preset reason plus the driver's optional note. */
export function overrideReasonText(reason: string, note?: string): string {
  const parts = [reason.trim(), (note ?? "").trim()].filter(Boolean);
  return parts.join(" · ").replace(/\s+/g, " ").slice(0, OVERRIDE_REASON_MAX);
}

export function cleanOverrideReason(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim().slice(0, OVERRIDE_REASON_MAX);
  return text || undefined;
}

/** Fields to store on a photo. Only a known warning is kept; older phones send neither. */
export function qualityOverrideFields(input?: {
  qualityOverride?: unknown;
  qualityOverrideReason?: unknown;
}): { qualityOverride?: PhotoQualityOverride; qualityOverrideReason?: string } {
  const qualityOverride = cleanQualityOverride(input?.qualityOverride);
  if (!qualityOverride) return {};
  const qualityOverrideReason = cleanOverrideReason(input?.qualityOverrideReason);
  return qualityOverrideReason ? { qualityOverride, qualityOverrideReason } : { qualityOverride };
}

const ISSUE_WORD: Record<PhotoQualityOverride, string> = {
  dark: "dark",
  blur: "blurry",
  blank: "blank",
};

/** Office marker, e.g. "Driver kept a dark photo: Too dark / night". */
export function overrideMarker(photo: {
  qualityOverride?: string | null;
  qualityOverrideReason?: string | null;
}): string | null {
  const issue = cleanQualityOverride(photo.qualityOverride);
  if (!issue) return null;
  const reason = cleanOverrideReason(photo.qualityOverrideReason);
  return `Driver kept a ${ISSUE_WORD[issue]} photo${reason ? `: ${reason}` : ""}`;
}

type OverridePhoto = { angle: PhotoAngle | string; qualityOverride?: string | null };

/** How many photos on a check the driver kept despite a dark/blank/blurry warning. */
export function qualityOverrideCount(photos: OverridePhoto[] | undefined): number {
  return (photos ?? []).filter((photo) => cleanQualityOverride(photo.qualityOverride)).length;
}

/** Slack line, or null when every photo passed. */
export function qualityOverrideSlackLine(photos: OverridePhoto[] | undefined): string | null {
  const kept = (photos ?? []).filter((photo) => cleanQualityOverride(photo.qualityOverride));
  if (!kept.length) return null;
  const labels = kept.map(
    (photo) => PHOTO_ANGLES.find((step) => step.angle === photo.angle)?.label ?? String(photo.angle)
  );
  const noun = kept.length === 1 ? "photo" : "photos";
  return `*:warning: Low-quality photos:* ${kept.length} ${noun} kept despite a dark/blurry warning (${labels.join(", ")}).`;
}
