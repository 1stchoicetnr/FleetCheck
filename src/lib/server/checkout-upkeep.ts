import {
  effectiveCheckoutSlack,
  parseCompanySettings,
  photoStepsForCompany,
  publicCompanySettings,
  slackWebhookOverride,
} from "@/lib/company-settings";
import { RAD_CAB_COMPANY_ID } from "@/lib/company-rules";
import { pgDb, pgGetReport, pgReadCompanySettings } from "@/lib/server/postgres-store";
import { runSlackDeliveries, slackWebhooksFromEnv } from "@/lib/server/slack-delivery";
import { sweepUnsentReports } from "@/lib/server/checkout-repo";
import { shouldRunUpkeep, UPKEEP_EVERY_MS } from "@/lib/upkeep-throttle";

function cleanError(err: unknown, max = 120): string {
  return err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "").slice(0, max) : "";
}

/**
 * Finish checks the phone never confirmed and retry Slack posts that failed.
 * The daily cron runs this, and so does ordinary app traffic (see upkeepSoon),
 * so a finished check does not wait until the next morning.
 */
export async function runCheckoutUpkeep(
  orgId: string,
  appOrigin?: string,
  options?: { sweepLimit?: number }
): Promise<{ sent: number; failed: number; dead: number; stalls: number; swept: number }> {
  const doc = parseCompanySettings(await pgReadCompanySettings(orgId));
  const settings = publicCompanySettings(doc);
  const photoSteps = photoStepsForCompany(settings, RAD_CAB_COMPANY_ID);
  const requiredRadCabAngles = photoSteps.filter((step) => step.required).map((step) => step.angle);
  let swept = 0;
  try {
    swept = (await sweepUnsentReports(orgId, { appOrigin, limit: options?.sweepLimit ?? 25 })).sent;
  } catch (err) {
    console.log(`[checkout-sweep] status=error error=${cleanError(err) || "failed"}`);
  }
  const counts = await runSlackDeliveries(pgDb(), {
    orgId,
    getReport: (id) => pgGetReport(orgId, id),
    routes: effectiveCheckoutSlack(doc),
    webhooks: slackWebhooksFromEnv(slackWebhookOverride(doc) || undefined),
    requiredRadCabAngles,
    photoSteps,
    appOrigin,
  });
  return { ...counts, swept };
}

let lastRun = 0;
let running: Promise<unknown> | null = null;

/**
 * Called after ordinary requests (app open, My checks, office list, uploads).
 * At most once every few minutes per server instance, production only, so
 * preview builds never mark live checks sent or post to Slack.
 */
export function upkeepSoon(orgId: string, appOrigin?: string): Promise<unknown> | null {
  const now = Date.now();
  if (!shouldRunUpkeep({ env: process.env.VERCEL_ENV, now, lastRun, running: Boolean(running) })) {
    return null;
  }
  lastRun = now;
  running = runCheckoutUpkeep(orgId, appOrigin, { sweepLimit: 10 })
    .then((result) => {
      if (result.swept || result.sent || result.failed || result.dead) {
        console.log(
          `[upkeep] swept=${result.swept} slackSent=${result.sent} slackFailed=${result.failed} dead=${result.dead} every=${UPKEEP_EVERY_MS / 60000}m`
        );
      }
    })
    .catch((err) => {
      console.log(`[upkeep] status=error error=${cleanError(err) || "failed"}`);
    })
    .finally(() => {
      running = null;
    });
  return running;
}
