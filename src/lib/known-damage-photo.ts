import { clientPhotoSrc } from "./photo-url.ts";

/** Browser address of the photo that shows a known-damage record (signed-in photo route). */
export function knownDamagePhotoSrc(item: { sourceReportId?: string; angle: string }): string {
  if (!item.sourceReportId) return "";
  return clientPhotoSrc(item.sourceReportId, item.angle, "stored");
}
