"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { canManageFleet } from "@/lib/fleet-config";
import {
  getSettings,
  saveSettings,
  getFleets,
  getUsers,
  getVehicles,
} from "@/lib/storage";
import { AppSettings, Fleet, User, Vehicle, FLEET_TYPE_LABELS } from "@/lib/types";
import Link from "next/link";
import { getPendingNotifications } from "@/lib/notifications";
import { Plus, Bell, Users, Truck, Save, Send } from "lucide-react";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [saved, setSaved] = useState(false);
  const [pendingNotifications, setPendingNotifications] = useState<
    ReturnType<typeof getPendingNotifications>
  >([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canManageFleet(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    Promise.all([getSettings(), getFleets(), getUsers(), getVehicles()]).then(
      ([s, f, u, v]) => {
        setSettings(s);
        setFleets(f);
        setUsers(u);
        setVehicles(v);
      }
    );
    setPendingNotifications(getPendingNotifications());
  }, [saved]);

  const handleSaveNotifications = async () => {
    if (!settings) return;
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading || !user || !settings) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Admin Panel" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Vehicles", value: vehicles.length, icon: Truck },
            { label: "Fleets", value: fleets.length, icon: Truck },
            { label: "Users", value: users.length, icon: Users },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="py-4 text-center">
                <stat.icon className="h-5 w-5 mx-auto text-brand-600 mb-1" />
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add Vehicle */}
        <Link href="/admin/vehicles/new">
          <Button size="lg" className="w-full">
            <Plus className="h-5 w-5 mr-2" />
            Add New Vehicle
          </Button>
        </Link>

        {/* Fleets */}
        <Card>
          <CardContent className="py-5 space-y-3">
            <CardTitle>Fleets</CardTitle>
            {fleets.map((f) => (
              <div
                key={f.id}
                className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="font-medium">{f.name}</p>
                  <p className="text-xs text-gray-500">
                    {FLEET_TYPE_LABELS[f.type]}
                  </p>
                </div>
                <span className="text-sm text-gray-400">
                  {vehicles.filter((v) => v.fleetId === f.id).length} vehicles
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card>
          <CardContent className="py-5 space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-brand-600" />
              <CardTitle>Notifications</CardTitle>
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
              <span className="text-sm font-medium">Slack Notifications</span>
              <input
                type="checkbox"
                checked={settings.notificationSettings.slackEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notificationSettings: {
                      ...settings.notificationSettings,
                      slackEnabled: e.target.checked,
                    },
                  })
                }
                className="h-5 w-5 rounded text-brand-600"
              />
            </label>

            {settings.notificationSettings.slackEnabled && (
              <Input
                label="Slack Webhook URL"
                placeholder="https://hooks.slack.com/..."
                value={settings.notificationSettings.slackWebhookUrl || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notificationSettings: {
                      ...settings.notificationSettings,
                      slackWebhookUrl: e.target.value,
                    },
                  })
                }
              />
            )}

            <label className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
              <span className="text-sm font-medium">Email Notifications</span>
              <input
                type="checkbox"
                checked={settings.notificationSettings.emailEnabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notificationSettings: {
                      ...settings.notificationSettings,
                      emailEnabled: e.target.checked,
                    },
                  })
                }
                className="h-5 w-5 rounded text-brand-600"
              />
            </label>

            {settings.notificationSettings.emailEnabled && (
              <Input
                label="Email Recipients (comma-separated)"
                placeholder="manager@company.com, tech@company.com"
                value={settings.notificationSettings.emailRecipients?.join(", ") || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notificationSettings: {
                      ...settings.notificationSettings,
                      emailRecipients: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            )}

            <div className="space-y-2">
              {[
                ["alertOnPoorCondition", "Alert on poor condition"],
                ["alertOnMaintenance", "Alert on maintenance issues"],
                ["alertOnOutOfService", "Alert when out of service"],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between p-3 rounded-xl bg-gray-50"
                >
                  <span className="text-sm">{label}</span>
                  <input
                    type="checkbox"
                    checked={
                      settings.notificationSettings[
                        key as keyof typeof settings.notificationSettings
                      ] as boolean
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        notificationSettings: {
                          ...settings.notificationSettings,
                          [key]: e.target.checked,
                        },
                      })
                    }
                    className="h-5 w-5 rounded text-brand-600"
                  />
                </label>
              ))}
            </div>

            <Button size="lg" className="w-full" onClick={handleSaveNotifications}>
              <Save className="h-4 w-4 mr-2" />
              {saved ? "Saved!" : "Save Settings"}
            </Button>
          </CardContent>
        </Card>

        {pendingNotifications.length > 0 && (
          <Card>
            <CardContent className="py-5 space-y-3">
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-brand-600" />
                <CardTitle>Queued Notifications</CardTitle>
              </div>
              <p className="text-xs text-gray-500">
                Alerts queued locally — connect webhooks in production
              </p>
              {pendingNotifications.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-xl bg-gray-50 text-sm border border-gray-100"
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium capitalize">{n.channel}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-700">{n.message}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
