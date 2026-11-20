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
import { beforeAfterPairs, beforeAfterSlackLines } from "@/lib/damage-before-after";
import { withoutKnownDamage } from "@/lib/known-damage";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import { photoAngleLabel } from "@/lib/photo-flags";
import {
  defaultRepairMentions,
  mentionLine,
  repairReportText,
  repairStatusText,
  whoHadItLast,
  whoHadItLastLines,
  type RepairMention,
} from "@/lib/repair-report";
import { localInsertAlert, localListAlerts, localListReports } from "./local-store";
import { pgInsertAlert, pgListAlerts, pgListVehicleReports } from "./postgres-store";
import { sharedBackendMode } from "./shared-config";
import { SharedOfficeAlert, type SharedVehicle } from "./shared-types";

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
  const details = alertDetailParts(alertDamageDetails(report));
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

/** Who the repair report tags for this fleet (notification settings; Rad Cab defaults to Mark). */
async function repairMentionsFor(orgId: string, companyId: string): Promise<RepairMention[]> {
  try {
    const { getPublicCompanySettings } = await import("./checkout-repo");
    const settings = await getPublicCompanySettings(orgId);
    return settings.repairMentions?.[companyId] ?? defaultRepairMentions(companyId);
  } catch {
    return defaultRepairMentions(companyId);
  }
}

async function unitStatusText(orgId: string, report: { vehicleId: string }): Promise<string> {
  try {
    const { getVehicle } = await import("./checkout-repo");
    const { listKnownDamage } = await import("./known-damage-repo");
    const [vehicle, known] = await Promise.all([
      getVehicle(orgId, report.vehicleId),
      listKnownDamage(orgId, report.vehicleId).catch(() => []),
    ]);
    return repairStatusText({
      outOfService: vehicle?.outOfService ?? null,
      known: known.filter((k) => !k.repairedAt).map((k) => `${photoAngleLabel(k.angle)} ${k.description}`),
    });
  } catch {
    return "In service";
  }
}

/** Build the repair report for a damage check: unit, plate, damage, before/after, who found it, who had it last, status, link. */
export async function buildDamageRepairReport(
  orgId: string,
  report: CheckoutReport,
  history: CheckoutReport[],
  options: { plainMentions?: boolean; banner?: string; extraAlertLines?: string[] } = {}
): Promise<string> {
  const origin = checkoutAppOrigin(process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL);
  const checkUrl = (id: string) => officeCheckUrl(origin, id);
  const [mentions, status] = await Promise.all([
    repairMentionsFor(orgId, report.companyId),
    unitStatusText(orgId, report),
  ]);
  return repairReportText({
    kind: "damage",
    banner: options.banner,
    unit: report.unitNumber ? `Unit ${report.unitNumber}` : formatUnitLabel(report.unitNumber, report.plate),
    plate: report.plate,
    vehicle: `${report.year} ${report.make} ${report.model}`,
    mention: mentionLine(mentions, options.plainMentions),
    damage: [...(options.extraAlertLines ?? []), ...alertDetailParts(alertDamageDetails(report))],
    beforeAfter: beforeAfterSlackLines(beforeAfterPairs(report, history), checkUrl, formatCheckoutTime),
    whoHadIt: whoHadItLastLines(whoHadItLast(report, history), checkUrl, formatCheckoutTime),
    status,
    link: { url: checkUrl(report.id), label: "Open the check" },
  });
}

async function postRepairText(companyId: string, text: string, tag: string): Promise<void> {
  if (!postsRepairSlack(companyId)) return;
  const route = repairRoute(companyId);
  try {
    const result = await sendRepairSlack({
      text,
      channelId: slackChannelIdForRoute(route),
      token: process.env.SLACK_BOT_TOKEN,
      webhookUrl: repairWebhook(route),
      dmUserId: route === "rad_cab" ? BELL_SLACK_USER : null,
    });
    console.info("[alerts] repair slack", tag, result);
  } catch (err) {
    console.error("[alerts] slack post failed:", err);
  }
}

async function postRepairSlack(
  orgId: string,
  report: CheckoutReport,
  alerts: SharedOfficeAlert[],
  history: CheckoutReport[]
): Promise<void> {
  if (!alerts.length || !postsRepairSlack(report.companyId)) return;
  const text = await buildDamageRepairReport(orgId, report, history, {
    extraAlertLines: alerts
      .filter((alert) => alert.type !== "damage_reported")
      .map((alert) => alert.message),
  });
  await postRepairText(report.companyId, text, report.id);
}

/**
 * Create in-app alerts for damage / needs repair and post them when a webhook is set.
 * Damage the driver confirmed as known ("Same as before") is left out, so a
 * check with only known damage sends nothing. Checks with no answers alert as before.
 */
export async function recordCheckoutAlerts(
  orgId: string,
  checked: CheckoutReport
): Promise<void> {
  const report = withoutKnownDamage(checked);
  const mode = sharedBackendMode();
  if (mode === "unconfigured") return;
  const kinds = checkoutAlertKinds(factsFor(report));
  let history: CheckoutReport[] | undefined;
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
    if (created.length) {
      history = await vehicleHistory(orgId, report).catch(() => []);
      await postRepairSlack(orgId, report, created, history);
    }
  }
  await recordRepeatIssues(orgId, report, history);
  // Bot photo check (off by default): office queue only, after the response.
  const { schedulePhotoCheck } = await import("./photo-check-wire");
  schedulePhotoCheck(orgId, checked.id);
}

async function vehicleHistory(orgId: string, report: CheckoutReport): Promise<CheckoutReport[]> {
  return sharedBackendMode() === "postgres"
    ? pgListVehicleReports(orgId, report.vehicleId)
    : (await localListReports()).filter(
        (item) => item.vehicleId === report.vehicleId && !item.archivedAt
      );
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

/**
 * Office marked a "Same as before" answer as actually new: add the damage alert
 * to the office queue. No Slack post (office is already looking at it).
 * Does nothing if the check already has a damage alert.
 */
export async function recordMissedDamageAlert(
  orgId: string,
  checked: CheckoutReport,
  options: { fallbackId?: string } = {}
): Promise<boolean> {
  const mode = sharedBackendMode();
  if (mode === "unconfigured") return false;
  const report = withoutKnownDamage(checked);
  const existing =
    mode === "postgres" ? await pgListAlerts(orgId, true) : await localListAlerts(true);
  let id = checkoutAlertId(report.id, "damage_reported");
  if (existing.some((alert) => alert.id === id)) {
    // The check already has a damage alert (e.g. the driver reported other damage).
    // A confirmed photo-check finding still gets its own alert and repair report.
    if (!options.fallbackId || existing.some((alert) => alert.id === options.fallbackId)) return false;
    id = options.fallbackId;
  }
  const alert: SharedOfficeAlert = {
    id,
    type: "damage_reported",
    message: alertMessage("damage_reported", report),
    vehicleId: report.vehicleId,
    vehiclePlate: formatUnitLabel(report.unitNumber, report.plate),
    actorName: report.driverName,
    reportId: report.id,
    createdAt: new Date().toISOString(),
    read: false,
  };
  if (mode === "postgres") await pgInsertAlert(orgId, alert);
  else await localInsertAlert(alert);
  // Office confirmed it is new damage: the repair report goes out like any other.
  const history = await vehicleHistory(orgId, report).catch(() => []);
  await postRepairSlack(orgId, report, [alert], history);
  return true;
}

/** Office set a unit Out of Service: one alert in the office queue. */
export async function recordVehicleOutOfService(
  orgId: string,
  vehicle: SharedVehicle,
  _req?: Request
): Promise<SharedOfficeAlert | undefined> {
  const mode = sharedBackendMode();
  if (mode === "unconfigured" || !vehicle.outOfService) return undefined;
  const unit = formatUnitLabel(vehicle.unitNumber, vehicle.plate);
  const oos = vehicle.outOfService;
  const alert: SharedOfficeAlert = {
    id: `oos:${vehicle.id}:${oos.since}`,
    type: "status_out_of_service",
    message: `${unit} set Out of Service by ${oos.by}${oos.reason ? `: ${oos.reason}` : ""}`,
    vehicleId: vehicle.id,
    vehiclePlate: unit,
    actorName: oos.by,
    createdAt: oos.since,
    read: false,
  };
  if (mode === "postgres") await pgInsertAlert(orgId, alert);
  else await localInsertAlert(alert);
  const text = await buildOutOfServiceRepairReport(orgId, vehicle);
  await postRepairText(vehicle.companyId, text, alert.id);
  return alert;
}

/** Repair report for a unit the office set Out of Service: who set it, why, and who had it last. */
export async function buildOutOfServiceRepairReport(
  orgId: string,
  vehicle: SharedVehicle,
  options: { plainMentions?: boolean; banner?: string; history?: CheckoutReport[] } = {}
): Promise<string> {
  const origin = checkoutAppOrigin(process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL);
  const checkUrl = (id: string) => officeCheckUrl(origin, id);
  const history = (options.history ?? (await vehicleHistory(orgId, { vehicleId: vehicle.id } as CheckoutReport).catch(() => [])))
    .filter((r) => r.completedAt)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const [mentions, status] = await Promise.all([
    repairMentionsFor(orgId, vehicle.companyId),
    unitStatusText(orgId, { vehicleId: vehicle.id }),
  ]);
  const latest = history[0];
  const recent = history.slice(0, 5).reverse();
  const link = (r: CheckoutReport) => `<${checkUrl(r.id)}|${formatCheckoutTime(r.completedAt)} · ${r.driverName}>`;
  const latestDamage = latest ? alertDetailParts(alertDamageDetails(withoutKnownDamage(latest))) : [];
  return repairReportText({
    kind: "out_of_service",
    banner: options.banner,
    unit: vehicle.unitNumber ? `Unit ${vehicle.unitNumber}` : formatUnitLabel(vehicle.unitNumber, vehicle.plate),
    plate: vehicle.plate,
    vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    mention: mentionLine(mentions, options.plainMentions),
    damage: [
      ...(vehicle.outOfService?.reason ? [`Reason: ${vehicle.outOfService.reason}`] : []),
      ...latestDamage.map((d) => `Last check: ${d}`),
    ],
    beforeAfter: [],
    whoHadIt: [
      `*Set by:* ${vehicle.outOfService?.by ?? "Office"}${vehicle.outOfService ? ` · ${formatCheckoutTime(vehicle.outOfService.since)}` : ""}`,
      "*Who had it last:*",
      ...(recent.length ? recent.map((r) => `• ${link(r)}`) : ["• no checks on record"]),
    ],
    status,
    link: latest
      ? { url: checkUrl(latest.id), label: "Open the last check" }
      : { url: `${origin}/vehicles/${vehicle.id}`, label: "Open the unit" },
  });
}
