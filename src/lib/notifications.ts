import { CheckRecord, Vehicle } from "./types";
import { getSettings } from "./storage";
import { MAINTENANCE_ISSUES } from "./types";

export interface PendingNotification {
  id: string;
  channel: "slack" | "email";
  subject: string;
  message: string;
  createdAt: string;
}

const NOTIFICATIONS_KEY = "fleetcheck-pending-notifications";

export function getPendingNotifications(): PendingNotification[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

function queueNotification(notification: PendingNotification) {
  const existing = getPendingNotifications();
  existing.unshift(notification);
  localStorage.setItem(
    NOTIFICATIONS_KEY,
    JSON.stringify(existing.slice(0, 100))
  );
}

export async function processCheckNotifications(
  check: CheckRecord,
  vehicle: Vehicle
): Promise<void> {
  const settings = await getSettings();
  const { notificationSettings: ns } = settings;
  const messages: string[] = [];

  if (ns.alertOnPoorCondition && check.conditionRating === "poor") {
    messages.push(
      `Poor condition reported on ${vehicle.plate} by ${check.driverName}`
    );
  }

  if (ns.alertOnMaintenance && check.maintenanceIssues.length > 0) {
    const issueLabels = check.maintenanceIssues
      .map((i) => MAINTENANCE_ISSUES.find((m) => m.id === i)?.label ?? i)
      .join(", ");
    messages.push(
      `Maintenance issues on ${vehicle.plate}: ${issueLabels}`
    );
  }

  if (ns.alertOnOutOfService && vehicle.status === "out_of_service") {
    messages.push(`${vehicle.plate} marked out of service`);
  }

  if (messages.length === 0) return;

  const body = messages.join("\n");
  const subject = `FleetCheck Alert: ${vehicle.plate}`;

  if (ns.slackEnabled) {
    queueNotification({
      id: `${Date.now()}-slack`,
      channel: "slack",
      subject,
      message: body,
      createdAt: new Date().toISOString(),
    });
  }

  if (ns.emailEnabled) {
    queueNotification({
      id: `${Date.now()}-email`,
      channel: "email",
      subject,
      message: `${body}\n\nRecipients: ${ns.emailRecipients?.join(", ") || "none configured"}`,
      createdAt: new Date().toISOString(),
    });
  }
}
