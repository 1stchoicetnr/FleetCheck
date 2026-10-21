import { RAD_CAB_COMPANY_ID } from "./company-rules";
import { checkoutDamageLines, checkoutResultLabel } from "./checkout-slack";
import { hasInspectionDamageNotes } from "./inspection-form";
import type { CheckoutReport } from "./types";

export type CheckoutSlackMode = "every" | "damage_or_fail" | "off";
export type CheckoutSlackDestination = "radcabcr" | "ashley_dm";

export interface CheckoutSlackRoute {
  mode: CheckoutSlackMode;
  destination: CheckoutSlackDestination;
}

export interface CheckoutSlackWebhooks {
  /** SLACK_WEBHOOK_RADCABCR, or the repairs webhook when that one is unset. */
  radcabcr?: string | null;
  /** SLACK_WEBHOOK_FEEDBACK. Incoming webhook aimed at a DM with Ashley. */
  ashleyDm?: string | null;
  /** Company-saved URL. Replaces #radcabcr only. */
  radcabOverride?: string | null;
}

export const CHECKOUT_SLACK_FLEETS: ReadonlyArray<{ id: string; name: string }> = [
  { id: RAD_CAB_COMPANY_ID, name: "Rad Cab" },
  { id: "company-1st-choice", name: "1st Choice Recovery" },
  { id: "company-pinkie-tow", name: "Pinkie Tow" },
  { id: "company-turo", name: "Turo" },
  { id: "company-other-fleets", name: "Other fleets" },
];

const MODES = new Set<CheckoutSlackMode>(["every", "damage_or_fail", "off"]);
const DESTINATIONS = new Set<CheckoutSlackDestination>(["radcabcr", "ashley_dm"]);

export function isCheckoutSlackMode(value: unknown): value is CheckoutSlackMode {
  return typeof value === "string" && MODES.has(value as CheckoutSlackMode);
}

export function isCheckoutSlackDestination(value: unknown): value is CheckoutSlackDestination {
  return typeof value === "string" && DESTINATIONS.has(value as CheckoutSlackDestination);
}

/** Rad Cab posts every check to #radcabcr. Every other fleet is quiet unless there is damage or a FAIL. */
export function defaultCheckoutSlackRoute(companyId?: string | null): CheckoutSlackRoute {
  if (companyId === RAD_CAB_COMPANY_ID) {
    return { mode: "every", destination: "radcabcr" };
  }
  return { mode: "damage_or_fail", destination: "ashley_dm" };
}

export function checkoutIsDamageOrFail(
  report: Pick<CheckoutReport, "reviewStatus" | "inspectionForm" | "photos">
): boolean {
  if (checkoutResultLabel(report) === "FAIL") return true;
  if (checkoutDamageLines(report).length > 0) return true;
  return hasInspectionDamageNotes(report.inspectionForm);
}

/**
 * Where this checkout should post, if anywhere.
 * A missing webhook returns undefined so the caller skips the send.
 */
export function checkoutSlackUrl(
  report: Pick<CheckoutReport, "reviewStatus" | "inspectionForm" | "photos">,
  route: CheckoutSlackRoute,
  webhooks: CheckoutSlackWebhooks
): string | undefined {
  if (route.mode === "off") return undefined;
  if (route.mode === "damage_or_fail" && !checkoutIsDamageOrFail(report)) return undefined;
  if (route.destination === "ashley_dm") {
    const url = webhooks.ashleyDm?.trim();
    return url || undefined;
  }
  const override = webhooks.radcabOverride?.trim();
  if (override) return override;
  const url = webhooks.radcabcr?.trim();
  return url || undefined;
}

/** Repair-channel posts stay on Rad Cab. Other fleets use the checkout DM instead. */
export function postsRepairSlack(companyId?: string | null): boolean {
  return companyId === RAD_CAB_COMPANY_ID;
}
