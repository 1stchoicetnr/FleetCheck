import { activeIssueFlagLabels } from "@/lib/inspection-form";
import { CheckoutReport } from "@/lib/types";
import { formatMileage, formatUnitLabel } from "@/lib/utils";

function checkoutSlackWebhook(): string | undefined {
  return (
    process.env.SLACK_WEBHOOK_RADCABCR ||
    process.env.SLACK_WEBHOOK_RAD_CAB_REPAIRS
  );
}

/** Slack is a notification, not the Office record. Never throw — Neon already saved. */
export async function notifyCheckoutReport(report: CheckoutReport): Promise<void> {
  const url = checkoutSlackWebhook();
  if (!url) return;
  const unit = formatUnitLabel(report.unitNumber, report.plate);
  const text = [
    "*Checkout Report saved to Office*",
    `*Unit:* ${unit}`,
    `*Vehicle:* ${report.year} ${report.make} ${report.model}`,
    `*Type:* ${report.type === "check_in" ? "Check in" : "Check out"}`,
    `*Driver:* ${report.driverName} · *Dispatcher:* ${report.dispatcherName}`,
    `*Odometer:* ${formatMileage(report.odometer)}`,
    report.inspectionForm
      ? `*Inspection:* Interior ${report.inspectionForm.interiorClean === "yes" ? "Yes" : "No"} · Exterior ${report.inspectionForm.exteriorClean === "yes" ? "Yes" : "No"}`
      : "",
    report.inspectionForm && activeIssueFlagLabels(report.inspectionForm).length
      ? `*Flags:* ${activeIssueFlagLabels(report.inspectionForm).join(", ")}`
      : "",
    report.inspectionForm?.additionalComments?.trim()
      ? `*Comments:* ${report.inspectionForm.additionalComments.trim()}`
      : "",
    `*Office id:* \`${report.id}\``,
    "_Slack is not the record. This row is in /office._",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, username: "FleetCheck" }),
    });
  } catch {
    // Office already has the row.
  }
}
