import { postsRepairSlack } from "@/lib/checkout-slack-route";
import { RAD_CAB_COMPANY_ID } from "@/lib/companies";
import {
  checkoutAlertId,
  checkoutAlertKinds,
  CheckoutAlertKind,
} from "@/lib/checkout-alert-rules";
import {
  activeIssueFlagLabels,
  hasInspectionDamageNotes,
} from "@/lib/inspection-form";
import {
  cleanDamageNote,
  photoAngleLabel,
  reportHasPhotoDamage,
} from "@/lib/photo-flags";
import { SlackRoute, slackChannelIdForRoute, slackChannelLabel } from "@/lib/slack-config";
import { CheckoutReport } from "@/lib/types";
import { repeatedIssues } from "@/lib/repeat-issues";
import { formatUnitLabel } from "@/lib/utils";
import { localInsertAlert, localListAlerts, localListReports } from "./local-store";
import { pgInsertAlert, pgListAlerts, pgListVehicleReports } from "./postgres-store";
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

function alertMessage(kind: CheckoutAlertKind, report: CheckoutReport): string {
  const unit = formatUnitLabel(report.unitNumber, report.plate);
  if (kind === "status_needs_work") return `${unit} needs repair`;
  if (kind === "status_out_of_service") return `${unit} marked out of service`;
  const details = [
    ...activeIssueFlagLabels(report.inspectionForm),
    ...report.photos.filter((photo) => photo.flaggedDamage).map((photo) => {
      const label = photoAngleLabel(photo.angle);
      const note = cleanDamageNote(photo.damageNote);
      return note ? `${label} (${note})` : label;
    }),
  ];
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
  alerts: SharedOfficeAlert[]
): Promise<void> {
  if (!alerts.length || !postsRepairSlack(report.companyId)) return;
  const route = repairRoute(report.companyId);
  const url = repairWebhook(route);
  if (!url) return;
  const unit = formatUnitLabel(report.unitNumber, report.plate);
  const text = [
    `*Inspekt alert* (${slackChannelLabel(route)})`,
    `*Unit:* ${unit}`,
    `*Vehicle:* ${report.year} ${report.make} ${report.model}`,
    `*Driver:* ${report.driverName}`,
    ...alerts.map((alert) => `*${alert.type.replace(/_/g, " ")}:* ${alert.message}`),
    `*Office id:* \`${report.id}\``,
  ].join("\n");
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        username: "Inspekt",
        channel: slackChannelIdForRoute(route),
      }),
    });
  } catch (err) {
    console.error("[alerts] slack post failed:", err);
  }
}

/** Create in-app alerts for damage / needs repair and post them when a webhook is set. */
export async function recordCheckoutAlerts(
  orgId: string,
  report: CheckoutReport
): Promise<void> {
  const mode = sharedBackendMode();
  if (mode === "unconfigured") return;
  const kinds = checkoutAlertKinds(factsFor(report));
  if (kinds.length) {
    const existing =
      mode === "postgres" ? await pgListAlerts(orgId, true) : await localListAlerts(true);
    const have = new Set(existing.map((alert) => alert.id));
    const created: SharedOfficeAlert[] = [];
    for (const kind of kinds) {
      const id = checkoutAlertId(report.id, kind);
      if (have.has(id)) continue;
      const alert: SharedOfficeAlert = {
        id,
        type: kind,
        message: alertMessage(kind, report),
        vehicleId: report.vehicleId,
        vehiclePlate: formatUnitLabel(report.unitNumber, report.plate),
        actorName: report.driverName,
        reportId: report.id,
        createdAt: new Date().toISOString(),
        read: false,
      };
      if (mode === "postgres") await pgInsertAlert(orgId, alert);
      else await localInsertAlert(alert);
      created.push(alert);
    }
    await postRepairSlack(report, created);
  }
  await recordRepeatIssues(orgId, report);
}

/** Same unit, same issue on two or more checks. Office only — this does not post to Slack. */
async function recordRepeatIssues(orgId: string, report: CheckoutReport): Promise<void> {
  const mode = sharedBackendMode();
  if (mode === "unconfigured") return;
  const history =
    mode === "postgres"
      ? await pgListVehicleReports(orgId, report.vehicleId)
      : (await localListReports()).filter(
          (item) => item.vehicleId === report.vehicleId && !item.archivedAt
        );
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
  }
}
