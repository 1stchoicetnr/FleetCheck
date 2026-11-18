/** Approximate image bytes in a data URL (0 for a link). */
function approxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) return 0;
  return Math.floor(((dataUrl.length - comma - 1) * 3) / 4);
}

/** One line per successful photo save, so an upload that worked is visible in the logs. */
export function photoSavedLog(input: {
  reportId: string;
  userId?: string | null;
  office: boolean;
  photos: Array<{ angle: string; dataUrl: string }>;
  ms: number;
  stored: number;
  sent: boolean;
}): string {
  const kb = Math.round(input.photos.reduce((sum, p) => sum + approxBytes(p.dataUrl), 0) / 1024);
  return [
    "[photo-saved]",
    `report=${input.reportId}`,
    `user=${input.userId || "unknown"}`,
    `by=${input.office ? "office" : "driver"}`,
    `count=${input.photos.length}`,
    `angles=${input.photos.map((p) => p.angle).join(",")}`,
    `kb=${kb}`,
    `ms=${Math.round(input.ms)}`,
    `stored=${input.stored}`,
    `sent=${input.sent ? "yes" : "no"}`,
  ].join(" ");
}
