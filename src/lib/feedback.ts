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
  userName?: string;
  userRole?: string;
}

export type FeedbackDelivery = "slack" | "email" | "office";

export interface StoredFeedback {
  id: string;
  type: FeedbackType;
  note?: string;
  unitId?: string;
  unitNumber?: string;
  plate?: string;
  pagePhase?: string;
  photoStep?: FeedbackPhotoStep | null;
  pageUrl?: string;
  userAgent?: string;
  userName?: string;
  userRole?: string;
  driverName?: string;
  /** Public URL, local /api/shared-files path, or a data URL Office can render. */
  screenshotUrl?: string;
  createdAt: string;
  deliveredVia: FeedbackDelivery;
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

export function feedbackDeliveryChannel(input: {
  slackWebhook?: string | null;
  resendApiKey?: string | null;
}): FeedbackDelivery {
  if (input.slackWebhook?.trim()) return "slack";
  if (input.resendApiKey?.trim()) return "email";
  return "office";
}

export function feedbackRoleLabel(role?: string | null): string {
  if (role === "management") return "Office";
  if (role === "super_admin") return "Super Admin";
  if (role === "tech") return "Tech";
  if (role === "driver") return "Driver";
  return role?.trim() || "Unknown role";
}

export function feedbackSavedMessage(
  delivered: FeedbackDelivery,
  options?: { slackFailed?: boolean }
): string {
  if (delivered === "slack") return "Sent to Slack. Office has a copy too.";
  if (delivered === "email") return "Emailed. Office has a copy too.";
  if (options?.slackFailed) {
    return "Saved for Office. Slack did not accept it. Check SLACK_WEBHOOK_FEEDBACK.";
  }
  return "Saved for Office. Slack isn't connected yet. Set SLACK_WEBHOOK_FEEDBACK so the next note posts there.";
}

export function formatFeedbackSlack(input: {
  payload: FeedbackPayload;
  screenshotUrl?: string;
}): { text: string; imageUrl?: string } {
  const { payload } = input;
  const who = payload.userName?.trim() || payload.driverName?.trim() || "Unknown";
  const lines = [
    `*FleetCheck feedback* — ${payload.type}`,
    `*Note:* ${payload.note?.trim() || "(no note)"}`,
    `*From:* ${who} · ${feedbackRoleLabel(payload.userRole)}`,
  ];
  const checkoutName = payload.driverName?.trim();
  if (checkoutName && checkoutName !== who) {
    lines.push(`*Checkout name:* ${checkoutName}`);
  }
  const step = feedbackStepLabel(payload.photoStep, payload.pagePhase);
  const page = [step || payload.pagePhase?.trim(), payload.pageUrl?.trim()]
    .filter(Boolean)
    .join(" · ");
  lines.push(`*Page:* ${page || "—"}`);
  const unitBits = [payload.unitNumber?.trim(), payload.plate?.trim()].filter(Boolean);
  if (payload.unitId?.trim()) unitBits.push(payload.unitId.trim());
  if (unitBits.length) lines.push(`*Unit:* ${unitBits.join(" · ")}`);
  const screenshot = input.screenshotUrl?.trim() || "";
  const imageUrl = screenshot.startsWith("https://") ? screenshot : undefined;
  if (imageUrl) lines.push(`*Screenshot:* ${imageUrl}`);
  else if (screenshot) lines.push("*Screenshot:* saved in Office");
  else lines.push("*Screenshot:* none");
  return { text: lines.join("\n"), imageUrl };
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
