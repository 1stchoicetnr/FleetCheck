"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { canManageOfficeRecords, canViewAlerts } from "@/lib/fleet-config";
import {
  deleteOfficeAlert,
  fetchOfficeAlerts,
  OfficeAlert,
  setOfficeAlertArchived,
} from "@/lib/checkout-api";
import { isOfficeUnlocked } from "@/lib/office-auth";
import {
  deleteAlert,
  getAlerts,
  markAlertRead,
  markAllAlertsRead,
  getSettings,
  setAlertArchived,
} from "@/lib/storage";
import { AlertEventType, ALERT_TYPE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, Bell, CheckCheck, Settings } from "lucide-react";

type FilterType = AlertEventType | "all" | "check_events";
type ListedAlert = OfficeAlert & { remote: boolean };

const CHECK_EVENT_TYPES: AlertEventType[] = [
  "check_in_completed",
  "check_out_completed",
];

export default function AlertsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [alerts, setAlerts] = useState<ListedAlert[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showCheckEvents, setShowCheckEvents] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [officeNote, setOfficeNote] = useState("");
  const [pending, setPending] = useState<null | {
    alert: ListedAlert;
    action: "archive" | "delete";
  }>(null);
  const [busy, setBusy] = useState(false);

  const loadAlerts = useCallback(async () => {
    const [items, settings] = await Promise.all([
      getAlerts(showArchived),
      getSettings(),
    ]);
    setShowCheckEvents(settings.notificationSettings.alertOnCheckInOut);
    let remote: OfficeAlert[] = [];
    try {
      remote = await fetchOfficeAlerts({ includeArchived: showArchived });
      setOfficeNote("");
    } catch (err) {
      setOfficeNote(
        err instanceof Error
          ? err.message
          : "Unlock office to load checkout alerts."
      );
    }
    const byId = new Map<string, ListedAlert>();
    for (const alert of items) byId.set(alert.id, { ...alert, remote: false });
    for (const alert of remote) byId.set(alert.id, { ...alert, remote: true });
    setAlerts(
      [...byId.values()].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      )
    );
  }, [showArchived]);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canViewAlerts(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (user && canViewAlerts(user.role)) {
      void loadAlerts();
    }
  }, [user, loadAlerts]);

  const handleMarkRead = async (id: string) => {
    await markAlertRead(id);
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: true } : a))
    );
  };

  const handleMarkAllRead = async () => {
    await markAllAlertsRead();
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  const handlePending = async () => {
    if (!pending) return;
    if (!pending.alert.remote && !isOfficeUnlocked()) {
      router.push("/office?next=/alerts");
      return;
    }
    setBusy(true);
    try {
      if (pending.action === "delete") {
        if (pending.alert.remote) await deleteOfficeAlert(pending.alert.id);
        else await deleteAlert(pending.alert.id);
      } else if (pending.alert.remote) {
        await setOfficeAlertArchived(pending.alert.id, !pending.alert.archivedAt);
      } else {
        await setAlertArchived(pending.alert.id, !pending.alert.archivedAt);
      }
      setPending(null);
      await loadAlerts();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update this alert.";
      setOfficeNote(message);
      if (/pin/i.test(message)) router.push("/office?next=/alerts");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) return null;

  const filtered = alerts.filter((a) => {
    if (filter === "all") {
      if (!showCheckEvents && CHECK_EVENT_TYPES.includes(a.type)) return false;
      return true;
    }
    if (filter === "check_events") {
      return CHECK_EVENT_TYPES.includes(a.type);
    }
    return a.type === filter;
  });

  const unreadCount = alerts.filter((a) => !a.read).length;

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "damage_reported", label: "Damage" },
    { key: "status_needs_work", label: "Needs Work" },
    { key: "status_out_of_service", label: "Out of Service" },
    { key: "known_issue_updated", label: "Known Issue" },
    { key: "check_events", label: "Check In/Out" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Alerts" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button size="sm" variant="secondary" onClick={handleMarkAllRead}>
                <CheckCheck className="h-4 w-4 mr-1" />
                Mark all read
              </Button>
            )}
            <Link href="/alerts/settings">
              <Button size="sm" variant="outline">
                <Settings className="h-4 w-4 mr-1" />
                Settings
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterButtons.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                filter === key
                  ? "bg-accent text-[#052e16]"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {officeNote && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            {officeNote}{" "}
            <Link href="/office?next=/alerts" className="underline font-semibold">
              Unlock office
            </Link>
          </p>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived alerts
        </label>

        {!showCheckEvents && filter === "all" && (
          <p className="text-xs text-gray-400">
            Check-in/out alerts are hidden. Enable them in Alert Settings.
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No alerts yet.</p>
          </div>
        ) : (
          filtered.map((alert) => (
            <Card
              key={alert.id}
              className={
                alert.read
                  ? "opacity-75"
                  : alert.type === "status_out_of_service" ||
                      alert.type === "damage_reported"
                    ? "border-red-200 bg-red-50/40"
                    : "border-yellow-200 bg-yellow-50/40"
              }
            >
              <CardContent className="py-4 space-y-2">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                      alert.type === "status_out_of_service" ||
                      alert.type === "damage_reported"
                        ? "text-red-500"
                        : "text-amber-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {ALERT_TYPE_LABELS[alert.type]}
                      </span>
                      {!alert.read && (
                        <span className="text-xs bg-accent text-[#052e16] px-2 py-0.5 rounded-full">
                          New
                        </span>
                      )}
                    </div>
                    <CardTitle className="text-sm mt-1">{alert.message}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      {alert.vehiclePlate} · {alert.actorName}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDate(alert.createdAt)}
                    </p>
                  </div>
                </div>
                {!alert.read && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => handleMarkRead(alert.id)}
                  >
                    Mark as read
                  </Button>
                )}
                {user && canManageOfficeRecords(user.role) && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        if (!alert.remote && !isOfficeUnlocked()) {
                          router.push("/office?next=/alerts");
                          return;
                        }
                        setPending({ alert, action: "archive" });
                      }}
                    >
                      {alert.archivedAt ? "Unarchive" : "Archive"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="flex-1"
                      onClick={() => {
                        if (!alert.remote && !isOfficeUnlocked()) {
                          router.push("/office?next=/alerts");
                          return;
                        }
                        setPending({ alert, action: "delete" });
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={
          pending
            ? `${pending.action === "delete" ? "Delete" : pending.alert.archivedAt ? "Unarchive" : "Archive"} ${pending.alert.vehiclePlate} ${ALERT_TYPE_LABELS[pending.alert.type]} from ${formatDate(pending.alert.createdAt)}?`
            : "Update this alert?"
        }
        body={
          pending?.action === "delete"
            ? "This removes the alert. The checkout report, if any, stays unless you delete that separately."
            : "Archived alerts stay out of the default list."
        }
        confirmLabel={pending?.action === "delete" ? "Delete alert" : pending?.alert.archivedAt ? "Unarchive" : "Archive"}
        danger={pending?.action === "delete"}
        busy={busy}
        onConfirm={() => void handlePending()}
        onCancel={() => {
          if (!busy) setPending(null);
        }}
      />
    </div>
  );
}
