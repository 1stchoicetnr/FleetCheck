import { postsRepairSlack } from "@/lib/checkout-slack-route";
import { RAD_CAB_COMPANY_ID } from "@/lib/companies";
import {
  checkoutAlertId,
  checkoutAlertKinds,
  CheckoutAlertKind,
} from "@/lib/checkout-alert-rules";
import { hasInspectionDamageNotes } from "@/lib/inspection-form";
import { reportHasPhotoDamage } from "@/lib/photo-flags";
import {
  alertDamageDetails,
  alertDetailParts,
  BELL_SLACK_USER,
  officeCheckUrl,
  repairSlackText,
  sendRepairSlack,
} from "@/lib/alert-details";
import { checkoutAppOrigin } from "@/lib/checkout-slack";
import { SlackRoute, slackChannelIdForRoute } from "@/lib/slack-config";
import { CheckoutReport } from "@/lib/types";
import { postAshleySlackDm } from "@/lib/ashley-slack";
import { repeatProblemNote } from "@/lib/driver-tally";
import { repeatedIssues } from "@/lib/repeat-issues";
import { formatUnitLabel } from "@/lib/utils";
import { damageItemKeys, openDamageAlerts, planDamageAlert } from "@/lib/damage-keys";
import { beforeAfterPairs, beforeAfterSlackLines } from "@/lib/damage-before-after";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import {
  localBumpAlertReport,
  localGetReport,
  localInsertAlert,
  localListAlerts,
  localListReports,
} from "./local-store";
import {
  pgBumpAlertReport,
  pgGetReport,
  pgInsertAlert,
  pgListAlerts,
  pgListVehicleReports,
} from "./postgres-store";
import { sharedBackendMode } from "./shared-config";
import { SharedOfficeAlert } from "./shared-types";

function factsFor(report: CheckoutReport) {
  const flags = report.inspectionForm?.issueFlags;
  return {
    needsRepair: Boolean(flags?.needsRepair),
    safety: Boolean(flags?.safety),
    refuseToDrive: Boolean(flags?.refuseToDrive),
    outOfService: Boolean(flags?.outOfService),
    photoDamage: reportHasPhotoDamage(report),
    damageNotes: hasInspectionDamageNotes(report.inspectionForm),
  };
}

function alertMessage(
  kind: CheckoutAlertKind,
  report: CheckoutReport,
  damageKeys?: string[] | null
): string {
  const unit = formatUnitLabel(report.unitNumber, report.plate);
  if (kind === "status_needs_work") return `${unit} needs repair`;
  if (kind === "status_out_of_service") return `${unit} marked out of service`;
  const details = alertDetailParts(alertDamageDetails(report, damageKeys));
  return details.length
    ? `Damage reported on ${unit}: ${details.join(", ")}`
    : `Damage reported on ${unit}`;
}

function repairRoute(companyId: string): SlackRoute {
  return companyId === RAD_CAB_COMPANY_ID ? "rad_cab" : "equipment";
}

function repairWebhook(route: SlackRoute): string | undefined {
  if (route === "rad_cab") return process.env.SLACK_WEBHOOK_RAD_CAB_REPAIRS;
  return process.env.SLACK_WEBHOOK_EQUIPMENT_ISSUES;
}

async function postRepairSlack(
  report: CheckoutReport,
  alerts: SharedOfficeAlert[],
  history: CheckoutReport[]
): Promise<void> {
  if (!alerts.length || !postsRepairSlack(report.companyId)) return;
  const route = repairRoute(report.companyId);
  const unit = formatUnitLabel(report.unitNumber, report.plate);
  const origin = checkoutAppOrigin(process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL);
  // A new damage alert lists only its new items; already-flagged damage is not repeated.
  const damageKeys = alerts.find((alert) => alert.type === "damage_reported")?.damageKeys;
  const text = repairSlackText({
    unit,
    vehicle: `${report.year} ${report.make} ${report.model}`,
    driverName: report.driverName,
    alertLines: alerts
      .filter((alert) => alert.type !== "damage_reported")
      .map((alert) => `*${alert.type.replace(/_/g, " ")}:* ${alert.message}`),
    details: alertDamageDetails(report, damageKeys),
    checkUrl: officeCheckUrl(origin, report.id),
    extraLines: beforeAfterSlackLines(
      beforeAfterPairs(report, history, { keys: damageKeys }),
      (id) => officeCheckUrl(origin, id),
      formatCheckoutTime
    ),
  });
  try {
    const result = await sendRepairSlack({
      text,
      channelId: slackChannelIdForRoute(route),
      token: process.env.SLACK_BOT_TOKEN,
      webhookUrl: repairWebhook(route),
      dmUserId: route === "rad_cab" ? BELL_SLACK_USER : null,
    });
    console.info("[alerts] repair slack", report.id, result);
  } catch (err) {
    console.error("[alerts] slack post failed:", err);
  }
}

async function vehicleHistory(orgId: string, report: CheckoutReport): Promise<CheckoutReport[]> {
  return sharedBackendMode() === "postgres"
    ? pgListVehicleReports(orgId, report.vehicleId)
    : (await localListReports()).filter(
        (item) => item.vehicleId === report.vehicleId && !item.archivedAt
      );
}

/**
 * Create in-app alerts for damage / needs repair and post them to Slack.
 * Damage already on an open alert for this unit (same area + item) bumps that
 * alert (count, last check, last driver) with no new alert and no Slack/Bell DM.
 * New damage still alerts. Archiving an alert means handled: a later report of
 * the same damage starts a fresh alert.
 */
export async function recordCheckoutAlerts(
  orgId: string,
  report: CheckoutReport
): Promise<void> {
  const mode = sharedBackendMode();
  if (mode === "unconfigured") return;
  const kinds = checkoutAlertKinds(factsFor(report));
  let history: CheckoutReport[] | undefined;
  if (kinds.length) {
    const existing =
      mode === "postgres" ? await pgListAlerts(orgId, true) : await localListAlerts(true);
    const have = new Set(existing.map((alert) => alert.id));
    const created: SharedOfficeAlert[] = [];
    const now = new Date().toISOString();
    for (const kind of kinds) {
      const id = checkoutAlertId(report.id, kind);
      let damageKeys: string[] | undefined;
      if (kind === "damage_reported") {
        const keys = damageItemKeys(report);
        if (keys.length) {
          const plan = planDamageAlert({
            reportId: report.id,
            keys,
            open: await openDamageAlerts(existing, report.vehicleId, (rid) =>
              mode === "postgres" ? pgGetReport(orgId, rid) : localGetReport(rid)
            ),
          });
          for (const bumpId of plan.bumpIds) {
            const input = { reportId: report.id, actorName: report.driverName, at: now };
            const bumped =
              mode === "postgres"
                ? await pgBumpAlertReport(orgId, bumpId, input)
                : await localBumpAlertReport(bumpId, input);
            console.info(`[alerts] report=${report.id} repeat-damage alert=${bumpId} bumped=${Boolean(bumped)}`);
          }
          if (!plan.newKeys.length) continue;
          damageKeys = plan.newKeys;
        }
      }
      if (have.has(id)) continue;
      const alert: SharedOfficeAlert = {
        id,
        type: kind,
        message: alertMessage(kind, report, damageKeys),
        vehicleId: report.vehicleId,
        vehiclePlate: formatUnitLabel(report.unitNumber, report.plate),
        actorName: report.driverName,
        reportId: report.id,
        createdAt: now,
        read: false,
        ...(damageKeys ? { damageKeys } : {}),
      };
      if (mode === "postgres") await pgInsertAlert(orgId, alert);
      else await localInsertAlert(alert);
      created.push(alert);
    }
    if (created.length) {
      history = await vehicleHistory(orgId, report).catch(() => []);
      await postRepairSlack(report, created, history);
    }
  }
  await recordRepeatIssues(orgId, report, history);
}

/** Same unit, same issue on two or more checks. The office queue keeps it, and Ashley gets a direct note. */
async function recordRepeatIssues(
  orgId: string,
  report: CheckoutReport,
  known?: CheckoutReport[]
): Promise<void> {
  const mode = sharedBackendMode();
  if (mode === "unconfigured") return;
  const history = known ?? (await vehicleHistory(orgId, report));
  const repeats = repeatedIssues(
    report,
    history.filter((item) => item.id !== report.id)
  );
  if (!repeats.length) return;
  const existing =
    mode === "postgres" ? await pgListAlerts(orgId, true) : await localListAlerts(true);
  const unit = formatUnitLabel(report.unitNumber, report.plate);
  for (const issue of repeats) {
    const stable = `repeat:${report.vehicleId}:${issue.key}`;
    const prior = existing.filter((alert) => alert.id === stable || alert.id.startsWith(`${stable}:`));
    const open = prior.some((alert) => !alert.archivedAt);
    if (open) continue;
    const archived = prior.some((alert) => alert.archivedAt);
    const alert: SharedOfficeAlert = {
      id: archived ? `${stable}:${report.id}` : stable,
      type: "repeat_problem",
      message: `${issue.label} is open again on ${unit} (${issue.count} checks)`,
      vehicleId: report.vehicleId,
      vehiclePlate: unit,
      actorName: report.driverName,
      reportId: report.id,
      createdAt: new Date().toISOString(),
      read: false,
    };
    if (mode === "postgres") await pgInsertAlert(orgId, alert);
    else await localInsertAlert(alert);
    await notifyAshleyRepeat(repeatProblemNote(alert.message, report.driverName));
  }
}

async function notifyAshleyRepeat(text: string): Promise<void> {
  try {
    await postAshleySlackDm(text, {
      token: process.env.SLACK_BOT_TOKEN,
      webhookUrl: process.env.SLACK_WEBHOOK_FEEDBACK,
    });
  } catch {
    // The office flag is already saved.
  }
}
