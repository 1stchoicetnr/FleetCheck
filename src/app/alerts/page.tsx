"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { canViewAlerts } from "@/lib/fleet-config";
import {
  getAlerts,
  markAlertRead,
  markAllAlertsRead,
  getSettings,
} from "@/lib/storage";
import { AlertEventType, FleetAlert, ALERT_TYPE_LABELS } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, Bell, CheckCheck, Settings } from "lucide-react";

type FilterType = AlertEventType | "all" | "check_events";

const CHECK_EVENT_TYPES: AlertEventType[] = [
  "check_in_completed",
  "check_out_completed",
];

export default function AlertsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [alerts, setAlerts] = useState<FleetAlert[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showCheckEvents, setShowCheckEvents] = useState(false);

  const loadAlerts = useCallback(async () => {
    const [items, settings] = await Promise.all([getAlerts(), getSettings()]);
    setShowCheckEvents(settings.notificationSettings.alertOnCheckInOut);
    setAlerts(items);
  }, []);

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
                  ? "bg-brand-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

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
                        <span className="text-xs bg-brand-600 text-white px-2 py-0.5 rounded-full">
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
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
