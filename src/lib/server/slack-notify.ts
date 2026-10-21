import { postCheckoutSlack } from "@/lib/checkout-slack";
import { CheckoutReport } from "@/lib/types";

function checkoutSlackWebhook(): string | undefined {
  return (
    process.env.SLACK_WEBHOOK_RADCABCR ||
    process.env.SLACK_WEBHOOK_RAD_CAB_REPAIRS
  );
}

/** Slack is a notification, not the Office record. Never throw — Neon already saved. */
export async function notifyCheckoutReport(
  report: CheckoutReport,
  options?: { webhookUrl?: string | null; usesClover?: boolean }
): Promise<void> {
  const url = options?.webhookUrl === undefined ? checkoutSlackWebhook() : options.webhookUrl || undefined;
  if (!url) return;
  try {
    await postCheckoutSlack(report, { webhookUrl: url });
  } catch {
    // Office already has the row.
  }
}
