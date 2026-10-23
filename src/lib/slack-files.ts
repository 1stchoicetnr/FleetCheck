import { photoAngleLabel } from "./photo-flags";
import {
  PHOTO_ANGLES,
  photoStepsForReport,
  type CheckoutReport,
  type PhotoStep,
  type VehiclePhoto,
} from "./types";

/** Slack accepts up to 10 files per complete call. Stay under that. */
export const SLACK_FILE_BATCH = 8;

export type SlackThreadFile = {
  key: string;
  filename: string;
  title: string;
};

export type SlackThreadProgress = {
  ts?: string;
  channel?: string;
  done: string[];
};

export function slackPhotoCaption(
  photo: Pick<VehiclePhoto, "angle" | "flaggedDamage">
): string {
  const label = photoAngleLabel(photo.angle);
  return photo.flaggedDamage ? `${label} · DAMAGE` : label;
}

function fileSlug(value: string): string {
  const slug = value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return slug || "file";
}

/**
 * PDF first, then every stored photo in walkaround slot order.
 * The same slots come out in the same order on every check.
 */
export function checkoutThreadFilePlan(
  report: Pick<CheckoutReport, "unitNumber" | "plate" | "photos">,
  steps?: PhotoStep[]
): SlackThreadFile[] {
  const unit = fileSlug(report.unitNumber || report.plate || "unit");
  const ordered = photoStepsForReport(steps?.length ? steps : PHOTO_ANGLES, report.photos);
  const photos = new Map(
    report.photos.filter((photo) => photo.dataUrl).map((photo) => [photo.angle, photo])
  );
  const files: SlackThreadFile[] = [
    {
      key: "pdf",
      filename: `checkout-${unit}.pdf`,
      title: "Checkout PDF",
    },
  ];
  const seen = new Set<string>();
  const pushPhoto = (photo: VehiclePhoto) => {
    if (seen.has(photo.angle)) return;
    seen.add(photo.angle);
    const index = String(files.length).padStart(2, "0");
    files.push({
      key: photo.angle,
      filename: `${index}-${fileSlug(photo.angle)}`,
      title: slackPhotoCaption(photo),
    });
  };
  for (const step of ordered) {
    const photo = photos.get(step.angle);
    if (photo) pushPhoto(photo);
  }
  for (const photo of report.photos) {
    if (photo.dataUrl) pushPhoto(photo);
  }
  return files;
}

export function parseSlackThreadProgress(body: string | null | undefined): SlackThreadProgress {
  if (!body) return { done: [] };
  try {
    const value = JSON.parse(body) as { ts?: unknown; channel?: unknown; done?: unknown };
    if (!value || typeof value !== "object" || !Array.isArray(value.done)) return { done: [] };
    return {
      ts: typeof value.ts === "string" && value.ts ? value.ts : undefined,
      channel: typeof value.channel === "string" && value.channel ? value.channel : undefined,
      done: value.done.map((item) => String(item)),
    };
  } catch {
    return { done: [] };
  }
}

export function slackThreadProgressBody(progress: SlackThreadProgress): string {
  return JSON.stringify({
    ts: progress.ts,
    channel: progress.channel,
    done: progress.done,
  });
}

export function pendingThreadFiles(
  plan: SlackThreadFile[],
  progress: SlackThreadProgress
): SlackThreadFile[] {
  const done = new Set(progress.done);
  return plan.filter((file) => !done.has(file.key));
}

/** PDF is its own batch so it stays first. Photos follow in batches. */
export function threadUploadBatches(pending: SlackThreadFile[]): SlackThreadFile[][] {
  const pdf = pending.filter((file) => file.key === "pdf");
  const photos = pending.filter((file) => file.key !== "pdf");
  const batches: SlackThreadFile[][] = [];
  if (pdf.length) batches.push(pdf);
  for (let index = 0; index < photos.length; index += SLACK_FILE_BATCH) {
    batches.push(photos.slice(index, index + SLACK_FILE_BATCH));
  }
  return batches;
}
