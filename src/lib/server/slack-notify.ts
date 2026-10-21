import { checkoutSlackUrl, defaultCheckoutSlackRoute, type CheckoutSlackRoute, type CheckoutSlackWebhooks } from "@/lib/checkout-slack-route";
import { postCheckoutSlack } from "@/lib/checkout-slack";
import { CheckoutReport } from "@/lib/types";

function envWebhooks(override?: string | null): CheckoutSlackWebhooks {
  return {
    radcabcr:
      process.env.SLACK_WEBHOOK_RADCABCR ||
      process.env.SLACK_WEBHOOK_RAD_CAB_REPAIRS,
    ashleyDm: process.env.SLACK_WEBHOOK_FEEDBACK,
    radcabOverride: override,
  };
}

/** Slack is a notification, not the Office record. Never throw — Neon already saved. */
export async function notifyCheckoutReport(
  report: CheckoutReport,
  options?: {
    route?: CheckoutSlackRoute;
    webhooks?: CheckoutSlackWebhooks;
    fetchImpl?: Parameters<typeof postCheckoutSlack>[1]["fetchImpl"];
    appOrigin?: string | null;
  }
): Promise<void> {
  const route = options?.route ?? defaultCheckoutSlackRoute(report.companyId);
  const webhooks = { ...envWebhooks(), ...options?.webhooks };
  const url = checkoutSlackUrl(report, route, webhooks);
  if (!url) return;
  try {
    await postCheckoutSlack(report, {
      webhookUrl: url,
      fetchImpl: options?.fetchImpl,
      appOrigin: options?.appOrigin,
    });
  } catch {
    // Office already has the row.
  }
}
