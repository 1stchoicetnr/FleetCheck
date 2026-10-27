import type { CheckoutInspectionForm } from "./inspection-form";
import { DAMAGE_SIDES } from "./inspection-form";
import { cleanDamageNote, damageFlagText } from "./photo-flags";
import type { CheckoutReport, FuelLevel } from "./types";
import { FUEL_LEVEL_LABELS } from "./types";
import { formatMileage, formatUnitLabel } from "./utils";

export type CheckoutFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  }
) => Promise<{ ok: boolean; status?: number; text: () => Promise<string> }>;

export class SlackDeliveryError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "SlackDeliveryError";
    this.status = status;
  }
}

/** Slack splits a single webhook body once the text gets long. Stay under that. */
export const CHECKOUT_SLACK_MAX = 2500;

const FALLBACK_ORIGIN = "https://fleet-check-eight.vercel.app";

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

/** Pacific time, labeled PT, so Slack and the PDF do not follow the server zone. */
export function formatCheckoutTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${formatted} PT`;
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

export function checkoutAppOrigin(value?: string | null): string {
  const raw = (value || "").trim().replace(/\/$/, "");
  if (/^https?:\/\//.test(raw)) return raw;
  return FALLBACK_ORIGIN;
}

export function checkoutReportLinks(
  reportId: string,
  appOrigin?: string | null
): { pdf: string; photos: string } {
  const origin = checkoutAppOrigin(appOrigin);
  const id = encodeURIComponent(reportId);
  return {
    pdf: `${origin}/api/checkout-reports/${id}/pdf`,
    photos: `${origin}/office/${id}/photos`,
  };
}

function composeSlack(head: string[], damage: string[], tail: string): string {
  const parts = [...head];
  if (damage.length) parts.push("*Damage:*", ...damage);
  return `${parts.join("\n")}\n${tail}`;
}

/** Shrink damage first. The PDF and gallery links stay intact unless the cap forces a hard cut. */
function fitCheckoutSlack(head: string[], damage: string[], tail: string): string {
  if (composeSlack(head, damage, tail).length <= CHECKOUT_SLACK_MAX) {
    return composeSlack(head, damage, tail);
  }
  let lines = [...damage];
  while (lines.length > 1 && composeSlack(head, lines, tail).length > CHECKOUT_SLACK_MAX) {
    lines.pop();
  }
  if (lines.length && composeSlack(head, lines, tail).length > CHECKOUT_SLACK_MAX) {
    const bare = composeSlack(head, [], tail).length;
    const overhead = composeSlack(head, ["x"], tail).length - bare - 1;
    const budget = CHECKOUT_SLACK_MAX - bare - overhead;
    lines = budget > 1 ? [`${lines[0].slice(0, budget - 1).trimEnd()}…`] : [];
  } else if (lines.length < damage.length && lines.length) {
    const marked = [...lines.slice(0, -1), `${lines[lines.length - 1]} …`];
    lines = composeSlack(head, marked, tail).length <= CHECKOUT_SLACK_MAX ? marked : lines.slice(0, -1);
  }
  let text = composeSlack(head, lines, tail);
  if (text.length <= CHECKOUT_SLACK_MAX) return text;
  text = composeSlack(head, [], tail);
  if (text.length <= CHECKOUT_SLACK_MAX) return text;
  const room = CHECKOUT_SLACK_MAX - tail.length - 1;
  const clipped = room > 1 ? `${head.join("\n").slice(0, room - 1).trimEnd()}…` : "";
  text = clipped ? `${clipped}\n${tail}` : tail;
  return text.length <= CHECKOUT_SLACK_MAX ? text : text.slice(0, CHECKOUT_SLACK_MAX);
}

/** One short checkout post: the check, damage, and two links. No per-photo list. */
export function checkoutSlackText(
  report: CheckoutReport,
  options?: { appOrigin?: string | null }
): string {
  const unit = formatUnitLabel(report.unitNumber, report.plate);
  const dispatcher = report.dispatcherName.trim() || "—";
  const links = checkoutReportLinks(report.id, options?.appOrigin);
  const head = [
    "*Checkout*",
    `*Unit #:* ${unit}`,
    `*Driver:* ${report.driverName.trim() || "—"}`,
    `*Dispatcher:* ${dispatcher}`,
    `*Odometer:* ${formatMileage(report.odometer)}`,
    `*Fuel:* ${fuelGaugeLabel(report.inspectionForm)}`,
    `*Result:* ${checkoutResultLabel(report)}`,
    `*Time:* ${formatCheckoutTime(report.completedAt)}`,
  ];
  const tail = `*PDF:* ${links.pdf}\n*Photos:* ${links.photos}`;
  return fitCheckoutSlack(head, checkoutDamageLines(report), tail);
}

/** One webhook post. Throws on HTTP errors, rate limits, and timeouts. */
export async function postSlackMessage(
  webhookUrl: string,
  text: string,
  fetchImpl?: CheckoutFetch
): Promise<void> {
  const send = fetchImpl ?? fetch;
  let response: { ok: boolean; status?: number; text: () => Promise<string> };
  try {
    response = await send(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, username: "Inspekt" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new SlackDeliveryError("timeout");
    }
    throw new SlackDeliveryError("network");
  }
  if (!response.ok) {
    const status = response.status || 0;
    throw new SlackDeliveryError(status ? `HTTP ${status}` : "HTTP error", status || undefined);
  }
}

/**
 * Send exactly one checkout message. A long body is shortened here so Slack
 * does not split it, and a thread id in the response is ignored.
 */
export async function postCheckoutSlack(
  report: CheckoutReport,
  options: { webhookUrl: string; fetchImpl?: CheckoutFetch; appOrigin?: string | null }
): Promise<{ text: string }> {
  const text = checkoutSlackText(report, { appOrigin: options.appOrigin });
  await postSlackMessage(options.webhookUrl, text, options.fetchImpl);
  return { text };
}
