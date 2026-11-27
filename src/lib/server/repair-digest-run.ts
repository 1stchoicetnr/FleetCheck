import { BELL_SLACK_USER, sendRepairSlack } from "@/lib/alert-details";
import { checkoutAppOrigin } from "@/lib/checkout-slack";
import { RAD_CAB_COMPANY_ID } from "@/lib/company-rules";
import { defaultRepairMentions, mentionText, type RepairMention } from "@/lib/repair-report";
import { sendDueRepairDigest, shouldSendRepairDigest, type DigestLine, type RepairDigestRunResult } from "@/lib/repair-digest";
import { slackChannelIdForRoute } from "@/lib/slack-config";
import { getPublicCompanySettings } from "./checkout-repo";
import { localClaimRepairDigest } from "./local-store";
import { claimRepairDigestItems } from "./org-data";
import { pgDb, pgMigrateAndSeed } from "./postgres-store";
import { sharedBackendMode } from "./shared-config";

function isoTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? String(value ?? "") : parsed.toISOString();
}

function rowsToLines(rows: Array<Record<string, unknown>>): DigestLine[] {
  return rows.map((row) => ({
    id: String(row.id),
    vehicleId: String(row.vehicle_id),
    unitLabel: String(row.unit_label),
    summary: String(row.summary),
    foundBy: String(row.found_by),
    foundAt: isoTime(row.found_at),
    reportId: String(row.report_id),
  }));
}

async function claim(orgId: string, digestKey: string, at: string): Promise<DigestLine[]> {
  const mode = sharedBackendMode();
  if (mode === "unconfigured") return [];
  if (mode === "postgres") {
    await pgMigrateAndSeed();
    return rowsToLines(await claimRepairDigestItems(pgDb(), orgId, digestKey, at));
  }
  const items = await localClaimRepairDigest(digestKey, at);
  return items.map((item) => ({
    id: item.id,
    vehicleId: item.vehicleId,
    unitLabel: item.unitLabel,
    summary: item.summary,
    foundBy: item.foundBy,
    foundAt: item.foundAt,
    reportId: item.reportId,
  }));
}

async function mentionsFor(orgId: string): Promise<RepairMention[]> {
  try {
    const settings = await getPublicCompanySettings(orgId);
    return settings.repairMentions?.[RAD_CAB_COMPANY_ID] ?? defaultRepairMentions(RAD_CAB_COMPANY_ID);
  } catch {
    return defaultRepairMentions(RAD_CAB_COMPANY_ID);
  }
}

/** Post the Rad Cab digest when it is 1 PM Pacific and the queue is not empty. */
export async function runRepairDigest(orgId: string, now = new Date()): Promise<RepairDigestRunResult> {
  if (!shouldSendRepairDigest(now)) return { posted: false, reason: "not-1pm", count: 0 };
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const webhook = process.env.SLACK_WEBHOOK_RAD_CAB_REPAIRS?.trim();
  if (!token && !webhook) {
    console.error("[repair-digest] slack is not configured");
    return { posted: false, reason: "unconfigured", count: 0 };
  }
  const origin = checkoutAppOrigin(process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL);
  const mention = mentionText(await mentionsFor(orgId));
  return sendDueRepairDigest({
    now,
    origin,
    mention,
    claim: (key, at) => claim(orgId, key, at),
    post: async (text) => {
      const result = await sendRepairSlack({
        text,
        channelId: slackChannelIdForRoute("rad_cab"),
        token: process.env.SLACK_BOT_TOKEN,
        webhookUrl: process.env.SLACK_WEBHOOK_RAD_CAB_REPAIRS,
        dmUserId: BELL_SLACK_USER,
      });
      console.info("[repair-digest] slack", { channel: result.channel, dm: result.dm, chars: text.length });
      if (result.channel !== "bot" && result.channel !== "webhook") {
        throw new Error(`repair digest was not posted (${result.channel})`);
      }
    },
  });
}
