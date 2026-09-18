export const FEEDBACK_TYPES = ["Bug", "Glitch", "Idea"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TO_DEFAULT = "ashley@warecovery.com";
export const FEEDBACK_NOTE_MAX = 2000;
export const FEEDBACK_SCREENSHOT_MAX_CHARS = 1_400_000;

export interface FeedbackPhotoStep {
  index: number;
  total: number;
  label: string;
}

export interface FeedbackPayload {
  type: FeedbackType;
  note?: string;
  screenshotDataUrl?: string;
  unitId?: string;
  unitNumber?: string;
  plate?: string;
  pagePhase?: string;
  photoStep?: FeedbackPhotoStep | null;
  pageUrl?: string;
  userAgent?: string;
  timestamp?: string;
  driverName?: string;
}

export function isFeedbackType(value: unknown): value is FeedbackType {
  return (
    typeof value === "string" &&
    (FEEDBACK_TYPES as readonly string[]).includes(value)
  );
}

export function feedbackSubject(input: {
  type: FeedbackType;
  unitNumber?: string;
  photoStep?: FeedbackPhotoStep | null;
  pagePhase?: string;
}): string {
  const unit = input.unitNumber?.trim()
    ? `Unit ${input.unitNumber.trim()}`
    : "Unit unknown";
  const step = feedbackStepLabel(input.photoStep, input.pagePhase);
  return step
    ? `[FleetCheck Feedback] ${input.type} — ${unit} — ${step}`
    : `[FleetCheck Feedback] ${input.type} — ${unit}`;
}

export function feedbackStepLabel(
  photoStep?: FeedbackPhotoStep | null,
  pagePhase?: string
): string {
  if (photoStep && Number.isFinite(photoStep.index)) {
    const label = photoStep.label?.trim();
    return label
      ? `step ${photoStep.index} ${label}`
      : `step ${photoStep.index}`;
  }
  if (pagePhase === "inspect") return "Precheck";
  if (pagePhase === "start") return "start";
  if (pagePhase === "complete") return "complete";
  return "";
}

export function parseImageDataUrl(dataUrl: string): {
  mime: string;
  base64: string;
  filename: string;
} | null {
  const match =
    /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
      dataUrl.trim()
    );
  if (!match) return null;
  const rawMime = match[1].toLowerCase();
  const mime = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
  const ext =
    mime === "image/png"
      ? "png"
      : mime === "image/webp"
        ? "webp"
        : mime === "image/gif"
          ? "gif"
          : "jpg";
  return {
    mime,
    base64: match[2].replace(/\s/g, ""),
    filename: `screenshot.${ext}`,
  };
}
