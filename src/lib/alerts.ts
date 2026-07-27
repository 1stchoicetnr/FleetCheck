import {
  AlertEventType,
  CheckRecord,
  Fleet,
  FleetType,
  MAINTENANCE_ISSUES,
  normalizeFleetType,
  NotificationSettings,
  Vehicle,
  VehicleStatus,
} from "./types";
import { getSettings, saveAlert } from "./storage";
import { generateId, formatDate, formatVehicleSlackLabel } from "./utils";
import {
  SLACK_CHANNEL_DEFAULTS,
  SlackRoute,
  slackChannelLabel,
} from "./slack-config";

export const SLACK_TEST_FOOTER =
  "⚠️ TESTING ONLY – This is not a real issue. App is in development.";

export type SlackChannel = SlackRoute;

export interface AlertPayload {
  type: AlertEventType;
  message: string;
  vehicle: Vehicle;
  fleetType: FleetType;
  actorName: string;
  note?: string;
}

export interface AlertDispatchResult {
  inAppCreated: boolean;
  slackSent: boolean;
  slackSkippedReason?: string;
}

function isCheckEvent(type: AlertEventType): boolean {
  return type === "check_in_completed" || type === "check_out_completed";
}

function shouldDispatch(type: AlertEventType, ns: NotificationSettings): boolean {
  if (isCheckEvent(type)) {
    return ns.alertOnCheckInOut;
  }
  return true;
}

function slackChannelForFleet(fleetType: FleetType | string): SlackChannel {
  return normalizeFleetType(fleetType) === "taxi" ? "rad_cab" : "equipment";
}

function channelEnabled(
  channel: SlackChannel,
  ns: NotificationSettings
): boolean {
  if (channel === "rad_cab") return ns.slackRadCabEnabled;
  return ns.slackEquipmentEnabled;
}

function webhookForChannel(
  channel: SlackChannel,
  ns: NotificationSettings
): string | undefined {
  if (channel === "rad_cab") return ns.slackRadCabWebhookUrl;
  return ns.slackEquipmentWebhookUrl;
}

function channelIdForRoute(
  channel: SlackChannel,
  ns: NotificationSettings
): string {
  if (channel === "rad_cab") {
    return ns.slackRadCabChannelId ?? SLACK_CHANNEL_DEFAULTS.rad_cab.id;
  }
  return ns.slackEquipmentChannelId ?? SLACK_CHANNEL_DEFAULTS.equipment.id;
}

function formatSlackMessage(payload: AlertPayload, route: SlackChannel): string {
  const channelLabel = slackChannelLabel(route);
  const lines = [
    `*FleetCheck Alert* (${channelLabel})`,
    `*Vehicle:* ${formatVehicleSlackLabel(payload.vehicle)}`,
    `*Event:* ${payload.message}`,
  ];
  if (payload.note?.trim()) {
    lines.push(`*Note:* ${payload.note.trim()}`);
  }
  lines.push(
    `*By:* ${payload.actorName}`,
    `*Time:* ${formatDate(new Date().toISOString())}`,
    "",
    SLACK_TEST_FOOTER
  );
  return lines.join("\n");
}

function slackSkipReason(
  ns: NotificationSettings,
  fleetType: FleetType
): string | undefined {
  if (!ns.slackEnabled) return "Slack alerts are turned off in Alert Settings";
  const channel = slackChannelForFleet(fleetType);
  if (!channelEnabled(channel, ns)) {
    return `The ${slackChannelLabel(channel)} channel is turned off in Alert Settings`;
  }
  if (!webhookForChannel(channel, ns)) {
    return `No webhook URL for ${slackChannelLabel(channel)} — add one in Alert Settings`;
  }
  return undefined;
}

async function sendSlackAlert(
  payload: AlertPayload,
  ns: NotificationSettings
): Promise<{ sent: boolean; error?: string }> {
  const skip = slackSkipReason(ns, payload.fleetType);
  if (skip) return { sent: false, error: skip };

  const channel = slackChannelForFleet(payload.fleetType);
  const webhookUrl = webhookForChannel(channel, ns)!;
  const channelId = channelIdForRoute(channel, ns);
  const message = formatSlackMessage(payload, channel);

  try {
    const res = await fetch("/api/alerts/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, channelId, message, webhookUrl }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { sent: false, error: data.error ?? "Slack request failed" };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : "Could not reach Slack",
    };
  }
}

export async function dispatchAlert(
  payload: AlertPayload
): Promise<AlertDispatchResult> {
  const settings = await getSettings();
  const ns = settings.notificationSettings;

  if (!shouldDispatch(payload.type, ns)) {
    return { inAppCreated: false, slackSent: false };
  }

  let inAppCreated = false;
  if (ns.inAppAlertsEnabled) {
    await saveAlert({
      id: generateId(),
      type: payload.type,
      message: payload.note
        ? `${payload.message} — ${payload.note}`
        : payload.message,
      vehicleId: payload.vehicle.id,
      vehiclePlate: payload.vehicle.plate,
      actorName: payload.actorName,
      createdAt: new Date().toISOString(),
      read: false,
    });
    inAppCreated = true;
  }

  const slack = await sendSlackAlert(payload, ns);
  return {
    inAppCreated,
    slackSent: slack.sent,
    slackSkippedReason: slack.error,
  };
}

function checkNotes(check: CheckRecord): string | undefined {
  const parts: string[] = [];
  if (check.maintenanceNotes?.trim()) {
    parts.push(check.maintenanceNotes.trim());
  }
  if (check.notes?.trim()) {
    parts.push(check.notes.trim());
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

export async function sendTestSlackAlert(
  fleetType: FleetType
): Promise<{ sent: boolean; error?: string }> {
  const settings = await getSettings();
  const ns = settings.notificationSettings;
  return sendSlackAlert(
    {
      type: "known_issue_updated",
      message: "Test message from FleetCheck",
      note: "If you see this, Slack is configured correctly.",
      vehicle: {
        id: "test",
        fleetId: "test",
        plate: "TEST-000",
        make: "Test",
        model: "Vehicle",
        year: 2024,
        status: "ready",
        qrCode: "TEST",
        createdAt: new Date().toISOString(),
      },
      fleetType,
      actorName: "FleetCheck",
    },
    ns
  );
}

export async function dispatchAlertsFromCheck(
  check: CheckRecord,
  vehicle: Vehicle,
  fleet: Fleet,
  previousStatus: VehicleStatus
): Promise<void> {
  const fleetType = normalizeFleetType(fleet.type);
  const actorName = check.driverName;
  const noteText = checkNotes(check);
  const hasDamage =
    check.maintenanceIssues.length > 0 || check.conditionRating === "poor";

  if (hasDamage) {
    const parts: string[] = [];
    if (check.maintenanceIssues.length > 0) {
      const labels = check.maintenanceIssues
        .map((i) => MAINTENANCE_ISSUES.find((m) => m.id === i)?.label ?? i)
        .join(", ");
      parts.push(labels);
    }
    if (check.conditionRating === "poor") {
      parts.push("Poor overall condition");
    }
    await dispatchAlert({
      type: "damage_reported",
      message: `New damage reported: ${parts.join("; ")}`,
      vehicle,
      fleetType,
      actorName,
      note: noteText,
    });
  } else if (noteText) {
    await dispatchAlert({
      type: "damage_reported",
      message: "Driver note submitted",
      vehicle,
      fleetType,
      actorName,
      note: noteText,
    });
  }

  if (vehicle.status === "needs_work" && previousStatus !== "needs_work") {
    await dispatchAlert({
      type: "status_needs_work",
      message: "Vehicle status changed to Needs Work",
      vehicle,
      fleetType,
      actorName,
    });
  }

  if (
    vehicle.status === "out_of_service" &&
    previousStatus !== "out_of_service"
  ) {
    await dispatchAlert({
      type: "status_out_of_service",
      message: "Vehicle status changed to Out of Service",
      vehicle,
      fleetType,
      actorName,
    });
  }

  if (check.type === "check_in") {
    await dispatchAlert({
      type: "check_in_completed",
      message: "Check-in completed",
      vehicle,
      fleetType,
      actorName,
      note: noteText,
    });
  } else {
    await dispatchAlert({
      type: "check_out_completed",
      message: "Check-out completed",
      vehicle,
      fleetType,
      actorName,
      note: noteText,
    });
  }
}

export async function dispatchKnownIssueAlert(
  vehicle: Vehicle,
  fleetType: FleetType,
  actorName: string,
  issueText: string,
  isOpen: boolean
): Promise<AlertDispatchResult> {
  const status = isOpen ? "added/updated" : "resolved";
  return dispatchAlert({
    type: "known_issue_updated",
    message: `Known issue ${status}`,
    note: issueText,
    vehicle,
    fleetType,
    actorName,
  });
}

export async function dispatchStatusChangeAlert(
  vehicle: Vehicle,
  fleetType: FleetType,
  actorName: string,
  newStatus: VehicleStatus,
  previousStatus: VehicleStatus
): Promise<void> {
  if (newStatus === previousStatus) return;

  if (newStatus === "needs_work") {
    await dispatchAlert({
      type: "status_needs_work",
      message: "Vehicle manually set to Needs Work",
      vehicle,
      fleetType,
      actorName,
    });
  } else if (newStatus === "out_of_service") {
    await dispatchAlert({
      type: "status_out_of_service",
      message: "Vehicle manually set to Out of Service",
      vehicle,
      fleetType,
      actorName,
    });
  }
}
