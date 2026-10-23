import { timingSafeEqual } from "node:crypto";
import { RAD_CAB_COMPANY_ID } from "../company-rules";
import {
  postCheckoutSlack,
  postSlackMessage,
  SlackDeliveryError,
  type CheckoutFetch,
} from "../checkout-slack";
import {
  checkoutSlackUrl,
  defaultCheckoutSlackRoute,
  type CheckoutSlackRoute,
  type CheckoutSlackWebhooks,
} from "../checkout-slack-route";
import {
  SLACK_DELIVERY_CAP,
  STALL_LOOKBACK_MS,
  STALL_PHOTOS_AFTER_MS,
  slackDeliveryExhausted,
  slackRetryDelayMs,
  stallReason,
  stallSlackText,
} from "../slack-delivery";
import type { CheckoutReport } from "../types";
import {
  claimFailedSlackDelivery,
  finishSlackDelivery,
  insertSlackDelivery,
  listDueSlackDeliveries,
  listRadCabStallCandidates,
  saveSlackDeliveryBody,
  type OrgDb,
  type SlackDeliveryKind,
} from "./org-data";

export type SlackSendStatus = "sent" | "failed" | "dead" | "skipped";

const BATCH = 8;

function deliveryId(kind: SlackDeliveryKind, reportId: string): string {
  return `slack-${kind}-${reportId}`.slice(0, 120);
}

function errorText(err: unknown): string {
  if (err instanceof SlackDeliveryError) return err.message.slice(0, 180);
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
    return err.message.replace(/https?:\/\/\S+/g, "").slice(0, 180) || "network";
  }
  return "network";
}

function logDelivery(
  kind: string,
  reportId: string,
  attempts: number,
  status: string,
  error?: string
) {
  const detail = error ? ` error=${error}` : "";
  console.log(
    `[slack-delivery] kind=${kind} report=${reportId} attempt=${attempts} status=${status}${detail}`
  );
}

async function claimDelivery(
  db: OrgDb,
  orgId: string,
  reportId: string,
  kind: SlackDeliveryKind
): Promise<{ attempts: number; body: string | null } | undefined> {
  const inserted = await insertSlackDelivery(db, {
    id: deliveryId(kind, reportId),
    orgId,
    reportId,
    kind,
  });
  if (inserted) return inserted;
  return claimFailedSlackDelivery(db, {
    orgId,
    reportId,
    kind,
    cap: SLACK_DELIVERY_CAP,
  });
}

async function recordFailure(
  db: OrgDb,
  orgId: string,
  reportId: string,
  kind: SlackDeliveryKind,
  attempts: number,
  err: unknown,
  now: number
): Promise<SlackSendStatus> {
  const message = errorText(err);
  const dead = slackDeliveryExhausted(attempts);
  const nextAttemptAt = dead
    ? null
    : new Date(now + slackRetryDelayMs(attempts)).toISOString();
  await finishSlackDelivery(db, {
    orgId,
    reportId,
    kind,
    status: dead ? "dead" : "failed",
    error: message,
    nextAttemptAt,
  });
  logDelivery(kind, reportId, attempts, dead ? "dead" : "retry", message);
  return dead ? "dead" : "failed";
}

export function slackWebhooksFromEnv(radcabOverride?: string | null): CheckoutSlackWebhooks {
  return {
    radcabcr:
      process.env.SLACK_WEBHOOK_RADCABCR || process.env.SLACK_WEBHOOK_RAD_CAB_REPAIRS,
    ashleyDm: process.env.SLACK_WEBHOOK_FEEDBACK,
    radcabOverride,
  };
}

export function radCabNoticeWebhook(webhooks: CheckoutSlackWebhooks): string | undefined {
  return checkoutSlackUrl(
    { reviewStatus: "pending", photos: [] },
    { mode: "every", destination: "radcabcr" },
    webhooks
  );
}

/** Cron bearer check. Missing secret is not the same as a wrong one. */
export function slackCronAuth(
  header: string | null,
  secret: string | undefined
): "ok" | "missing" | "denied" {
  if (!secret) return "missing";
  const expected = `Bearer ${secret}`;
  const got = header ?? "";
  const actual = Buffer.from(got);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return "denied";
  return "ok";
}

/** Post the checkout message once. A later call does not post again after success. */
export async function deliverCheckoutSlack(
  db: OrgDb,
  report: CheckoutReport,
  options: {
    orgId: string;
    route?: CheckoutSlackRoute;
    webhooks: CheckoutSlackWebhooks;
    appOrigin?: string | null;
    fetchImpl?: CheckoutFetch;
    now?: number;
  }
): Promise<SlackSendStatus> {
  const route = options.route ?? defaultCheckoutSlackRoute(report.companyId);
  const url = checkoutSlackUrl(report, route, options.webhooks);
  if (!url) {
    logDelivery("checkout", report.id, 0, "skipped", "no webhook");
    return "skipped";
  }
  const claimed = await claimDelivery(db, options.orgId, report.id, "checkout");
  if (!claimed) return "skipped";
  try {
    await postCheckoutSlack(report, {
      webhookUrl: url,
      fetchImpl: options.fetchImpl,
      appOrigin: options.appOrigin,
    });
    await finishSlackDelivery(db, {
      orgId: options.orgId,
      reportId: report.id,
      kind: "checkout",
      status: "sent",
    });
    logDelivery("checkout", report.id, claimed.attempts, "sent");
    return "sent";
  } catch (err) {
    return recordFailure(
      db,
      options.orgId,
      report.id,
      "checkout",
      claimed.attempts,
      err,
      options.now ?? Date.now()
    );
  }
}

export async function deliverStallSlack(
  db: OrgDb,
  input: {
    orgId: string;
    reportId: string;
    /** Stored body is reused on retry. Null does not invent a new reason. */
    text: string | null;
    sentAt?: string | null;
    archivedAt?: string | null;
    webhooks: CheckoutSlackWebhooks;
    fetchImpl?: CheckoutFetch;
    now?: number;
  }
): Promise<SlackSendStatus> {
  if (input.sentAt || input.archivedAt) return "skipped";
  const url = radCabNoticeWebhook(input.webhooks);
  if (!url) {
    logDelivery("stall", input.reportId, 0, "skipped", "no webhook");
    return "skipped";
  }
  const claimed = await claimDelivery(db, input.orgId, input.reportId, "stall");
  if (!claimed) return "skipped";
  const text = claimed.body || input.text;
  if (!text) {
    await finishSlackDelivery(db, {
      orgId: input.orgId,
      reportId: input.reportId,
      kind: "stall",
      status: "skipped",
      error: "not stalled",
    });
    logDelivery("stall", input.reportId, claimed.attempts, "skipped", "not stalled");
    return "skipped";
  }
  if (!claimed.body) {
    await saveSlackDeliveryBody(db, {
      orgId: input.orgId,
      reportId: input.reportId,
      kind: "stall",
      body: text,
    });
  }
  try {
    await postSlackMessage(url, text, input.fetchImpl);
    await finishSlackDelivery(db, {
      orgId: input.orgId,
      reportId: input.reportId,
      kind: "stall",
      status: "sent",
    });
    logDelivery("stall", input.reportId, claimed.attempts, "sent");
    return "sent";
  } catch (err) {
    return recordFailure(
      db,
      input.orgId,
      input.reportId,
      "stall",
      claimed.attempts,
      err,
      input.now ?? Date.now()
    );
  }
}

export async function runSlackDeliveries(
  db: OrgDb,
  input: {
    orgId: string;
    getReport: (id: string) => Promise<CheckoutReport | undefined>;
    routes: Record<string, CheckoutSlackRoute>;
    webhooks: CheckoutSlackWebhooks;
    requiredRadCabAngles: string[];
    appOrigin?: string | null;
    fetchImpl?: CheckoutFetch;
    now?: number;
  }
): Promise<{ sent: number; failed: number; dead: number; stalls: number }> {
  const now = input.now ?? Date.now();
  const counts = { sent: 0, failed: 0, dead: 0, stalls: 0 };
  const tally = (kind: SlackDeliveryKind, status: SlackSendStatus) => {
    if (status === "sent") {
      counts.sent += 1;
      if (kind === "stall") counts.stalls += 1;
    } else if (status === "failed") counts.failed += 1;
    else if (status === "dead") counts.dead += 1;
  };

  const due = await listDueSlackDeliveries(db, input.orgId, SLACK_DELIVERY_CAP, BATCH);
  for (const row of due) {
    const report = await input.getReport(row.reportId);
    if (!report || report.archivedAt) {
      const claimed = await claimDelivery(db, input.orgId, row.reportId, row.kind);
      if (!claimed) continue;
      await finishSlackDelivery(db, {
        orgId: input.orgId,
        reportId: row.reportId,
        kind: row.kind,
        status: "dead",
        error: report ? "archived" : "missing",
      });
      logDelivery(row.kind, row.reportId, claimed.attempts, "dead", report ? "archived" : "missing");
      counts.dead += 1;
      continue;
    }
    if (row.kind === "stall") {
      if (report.sentAt) {
        const claimed = await claimDelivery(db, input.orgId, report.id, "stall");
        if (!claimed) continue;
        await finishSlackDelivery(db, {
          orgId: input.orgId,
          reportId: report.id,
          kind: "stall",
          status: "skipped",
          error: "completed",
        });
        logDelivery("stall", report.id, claimed.attempts, "skipped", "completed");
        continue;
      }
      const reason = stallReason({
        createdAt: report.createdAt,
        sentAt: report.sentAt,
        archivedAt: report.archivedAt,
        photoAngles: report.photos.map((photo) => photo.angle),
        requiredAngles: input.requiredRadCabAngles,
        now,
      });
      tally(
        "stall",
        await deliverStallSlack(db, {
          orgId: input.orgId,
          reportId: report.id,
          text: reason
            ? stallSlackText({
                unitNumber: report.unitNumber,
                plate: report.plate,
                driverName: report.driverName,
                dispatcherName: report.dispatcherName,
                startedAt: report.createdAt,
                reason,
              })
            : null,
          webhooks: input.webhooks,
          fetchImpl: input.fetchImpl,
          now,
        })
      );
      continue;
    }
    tally(
      "checkout",
      await deliverCheckoutSlack(db, report, {
        orgId: input.orgId,
        route: input.routes[report.companyId],
        webhooks: input.webhooks,
        appOrigin: input.appOrigin,
        fetchImpl: input.fetchImpl,
        now,
      })
    );
  }

  const newest = new Date(now - STALL_PHOTOS_AFTER_MS).toISOString();
  const oldest = new Date(now - STALL_LOOKBACK_MS).toISOString();
  const candidates = await listRadCabStallCandidates(db, {
    orgId: input.orgId,
    companyId: RAD_CAB_COMPANY_ID,
    oldest,
    newest,
    limit: BATCH,
  });
  for (const candidate of candidates) {
    const reason = stallReason({
      createdAt: candidate.createdAt,
      photoAngles: candidate.photoAngles,
      requiredAngles: input.requiredRadCabAngles,
      now,
    });
    if (!reason) continue;
    tally(
      "stall",
      await deliverStallSlack(db, {
        orgId: input.orgId,
        reportId: candidate.id,
        text: stallSlackText({
          unitNumber: candidate.unitNumber,
          plate: candidate.plate,
          driverName: candidate.driverName,
          dispatcherName: candidate.dispatcherName,
          startedAt: candidate.createdAt,
          reason,
        }),
        webhooks: input.webhooks,
        fetchImpl: input.fetchImpl,
        now,
      })
    );
  }

  console.log(
    `[slack-delivery] sent=${counts.sent} failed=${counts.failed} dead=${counts.dead} stalls=${counts.stalls}`
  );
  return counts;
}
