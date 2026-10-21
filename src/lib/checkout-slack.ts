import type { CheckoutInspectionForm } from "./inspection-form";
import { DAMAGE_SIDES } from "./inspection-form";
import { cleanDamageNote, damageFlagText, photoAngleLabel } from "./photo-flags";
import type { CheckoutReport, FuelLevel, PhotoAngle } from "./types";
import { FUEL_LEVEL_LABELS, PHOTO_ANGLES } from "./types";
import { formatMileage, formatUnitLabel } from "./utils";

export type CheckoutFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; text: () => Promise<string> }>;

const FUEL_GAUGES = new Set<FuelLevel>([
  "full",
  "three_quarter",
  "half",
  "quarter",
  "empty",
]);

export function checkoutResultLabel(
  report: Pick<CheckoutReport, "reviewStatus" | "inspectionForm">
): "PASS" | "Conditional" | "FAIL" | "Pending review" {
  if (report.reviewStatus === "pass") return "PASS";
  if (report.reviewStatus === "conditional") return "Conditional";
  if (report.reviewStatus === "fail") return "FAIL";
  const light = report.inspectionForm?.trafficLight;
  if (light === "green") return "PASS";
  if (light === "yellow") return "Conditional";
  if (light === "red") return "FAIL";
  return "Pending review";
}

export function fuelGaugeLabel(form?: CheckoutInspectionForm | null): string {
  if (!form) return "—";
  if (form.powertrain === "ev") return "N/A";
  const gauge = form.fuelGauge;
  if (gauge && FUEL_GAUGES.has(gauge)) return FUEL_LEVEL_LABELS[gauge];
  return "—";
}

/** Central time, so the Slack line does not depend on the server zone. */
export function formatCheckoutTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function checkoutDamageLines(
  report: Pick<CheckoutReport, "photos" | "inspectionForm">
): string[] {
  const lines = report.photos
    .filter((photo) => photo.flaggedDamage)
    .map((photo) => damageFlagText(photo));
  const damage = report.inspectionForm?.damage;
  if (damage) {
    for (const side of DAMAGE_SIDES) {
      const note = cleanDamageNote(damage[side.id]);
      if (note) lines.push(`${side.label}: ${note}`);
    }
  }
  return lines;
}

function publicPhotoUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://");
}

export function checkoutPhotoLinks(
  report: Pick<CheckoutReport, "photos">
): Array<{ label: string; url: string; angle: PhotoAngle }> {
  const order = new Map(PHOTO_ANGLES.map((step, index) => [step.angle, index]));
  return [...report.photos]
    .filter((photo) => publicPhotoUrl(photo.dataUrl))
    .sort((a, b) => (order.get(a.angle) ?? 99) - (order.get(b.angle) ?? 99))
    .map((photo) => ({
      angle: photo.angle,
      label: photoAngleLabel(photo.angle),
      url: photo.dataUrl,
    }));
}

/** Parent Slack text. Always names the check. Photo links are included when the webhook cannot thread. */
export function checkoutSlackText(
  report: CheckoutReport,
  options?: { includePhotoLinks?: boolean }
): string {
  const unit = formatUnitLabel(report.unitNumber, report.plate);
  const dispatcher = report.dispatcherName.trim() || "—";
  const damage = checkoutDamageLines(report);
  const lines = [
    "*Checkout*",
    `*Unit #:* ${unit}`,
    `*Driver:* ${report.driverName.trim() || "—"}`,
    `*Dispatcher:* ${dispatcher}`,
    `*Odometer:* ${formatMileage(report.odometer)}`,
    `*Fuel:* ${fuelGaugeLabel(report.inspectionForm)}`,
    `*Result:* ${checkoutResultLabel(report)}`,
    `*Time:* ${formatCheckoutTime(report.completedAt)}`,
    damage.length ? `*Damage:* ${damage.join("; ")}` : "",
  ];
  if (options?.includePhotoLinks) {
    const links = checkoutPhotoLinks(report);
    if (links.length) {
      lines.push("*Photos:*");
      for (const photo of links) lines.push(`${photo.label}: ${photo.url}`);
    }
  }
  lines.push(`*Office id:* \`${report.id}\``);
  return lines.filter(Boolean).join("\n");
}

function threadTs(raw: string): string | undefined {
  try {
    const json = JSON.parse(raw) as { ts?: unknown; message?: { ts?: unknown } };
    if (typeof json.ts === "string" && json.ts) return json.ts;
    if (typeof json.message?.ts === "string" && json.message.ts) return json.message.ts;
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Post the checkout. The parent always names the check.
 * Incoming webhooks usually cannot thread, so the parent also carries the
 * labeled Blob links. When a thread id comes back, each photo is also a labeled reply.
 */
export async function postCheckoutSlack(
  report: CheckoutReport,
  options: { webhookUrl: string; fetchImpl?: CheckoutFetch }
): Promise<{ text: string; threaded: boolean }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const photos = checkoutPhotoLinks(report);
  const text = checkoutSlackText(report, { includePhotoLinks: photos.length > 0 });
  const response = await fetchImpl(options.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, username: "Inspekt" }),
  });
  const raw = await response.text().catch(() => "");
  const ts = threadTs(raw);
  if (!ts || photos.length === 0) return { text, threaded: false };
  for (const photo of photos) {
    await fetchImpl(options.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `${photo.label}\n${photo.url}`,
        username: "Inspekt",
        thread_ts: ts,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${photo.label}*\n${photo.url}` },
          },
          {
            type: "image",
            image_url: photo.url,
            alt_text: photo.label,
          },
        ],
      }),
    });
  }
  return { text, threaded: true };
}
