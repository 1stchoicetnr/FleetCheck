"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { canManageAlertSettings } from "@/lib/fleet-config";
import { getSettings, saveSettings } from "@/lib/storage";
import { AppSettings } from "@/lib/types";
import { SLACK_TEST_FOOTER, sendTestSlackAlert } from "@/lib/alerts";
import { SLACK_CHANNEL_DEFAULTS } from "@/lib/slack-config";
import { Bell, Save, Send } from "lucide-react";

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 p-3 rounded-xl bg-gray-50 cursor-pointer">
      <div>
        <span className="text-sm font-medium block">{label}</span>
        {description && (
          <span className="text-xs text-gray-500 mt-0.5 block">{description}</span>
        )}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded text-brand-600 mt-0.5 flex-shrink-0"
      />
    </label>
  );
}

export default function AlertSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState<"rad_cab" | "equipment" | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canManageAlertSettings(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestSlack = async (channel: "rad_cab" | "equipment") => {
    if (!settings) return;
    await saveSettings(settings);
    setTesting(channel);
    setTestResult(null);
    const fleetType = channel === "rad_cab" ? "taxi" : "tow";
    const result = await sendTestSlackAlert(fleetType);
    setTesting(null);
    setTestResult(
      result.sent
        ? `Test message sent to #${SLACK_CHANNEL_DEFAULTS[channel].name}.`
        : result.error ?? "Test failed"
    );
  };

  if (loading || !user || !settings) return null;

  const ns = settings.notificationSettings;
  const slackNotReady =
    ns.slackEnabled &&
    (!ns.slackRadCabWebhookUrl || !ns.slackEquipmentWebhookUrl);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Alert Settings" backHref="/alerts" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {slackNotReady && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Slack is on but webhook URLs are missing. Add a webhook for each
            channel below, then tap <strong>Save Settings</strong> and{" "}
            <strong>Send test</strong>.
          </p>
        )}
        <Card>
          <CardContent className="py-5 space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-brand-600" />
              <CardTitle>In-App Alerts</CardTitle>
            </div>
            <ToggleRow
              label="In-app alerts"
              description="Show alerts in the Alerts section for Tech and Management"
              checked={ns.inAppAlertsEnabled}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  notificationSettings: { ...ns, inAppAlertsEnabled: v },
                })
              }
            />
            <ToggleRow
              label="Check-in / Check-out alerts"
              description="Also alert when a driver completes check-in or check-out"
              checked={ns.alertOnCheckInOut}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  notificationSettings: { ...ns, alertOnCheckInOut: v },
                })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5 space-y-3">
            <CardTitle>Slack Alerts</CardTitle>
            <p className="text-xs text-gray-500">
              Taxi vehicles →{" "}
              <a
                href={SLACK_CHANNEL_DEFAULTS.rad_cab.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline"
              >
                #rad-cab-repairs
              </a>
              . All other vehicles →{" "}
              <a
                href={SLACK_CHANNEL_DEFAULTS.equipment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 underline"
              >
                #equipment-issues
              </a>
              .
            </p>
            <ToggleRow
              label="Slack alerts"
              description="Send messages to Slack when events occur"
              checked={ns.slackEnabled}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  notificationSettings: { ...ns, slackEnabled: v },
                })
              }
            />
            {ns.slackEnabled && (
              <>
                <ToggleRow
                  label="Rad-cab-repairs channel (Taxis)"
                  checked={ns.slackRadCabEnabled}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      notificationSettings: { ...ns, slackRadCabEnabled: v },
                    })
                  }
                />
                <Input
                  label="Rad-cab-repairs channel ID"
                  placeholder="C09K8F5F05U"
                  value={ns.slackRadCabChannelId || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notificationSettings: {
                        ...ns,
                        slackRadCabChannelId: e.target.value,
                      },
                    })
                  }
                />
                <Input
                  label="Rad-cab-repairs webhook URL"
                  placeholder="https://hooks.slack.com/... or set SLACK_WEBHOOK_RAD_CAB_REPAIRS"
                  value={ns.slackRadCabWebhookUrl || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notificationSettings: {
                        ...ns,
                        slackRadCabWebhookUrl: e.target.value,
                      },
                    })
                  }
                />
                <ToggleRow
                  label="Equipment-issues channel (all other vehicles)"
                  checked={ns.slackEquipmentEnabled}
                  onChange={(v) =>
                    setSettings({
                      ...settings,
                      notificationSettings: {
                        ...ns,
                        slackEquipmentEnabled: v,
                      },
                    })
                  }
                />
                <Input
                  label="Equipment-issues channel ID"
                  placeholder="CJU3KD10D"
                  value={ns.slackEquipmentChannelId || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notificationSettings: {
                        ...ns,
                        slackEquipmentChannelId: e.target.value,
                      },
                    })
                  }
                />
                <Input
                  label="Equipment-issues webhook URL"
                  placeholder="https://hooks.slack.com/... or set SLACK_WEBHOOK_EQUIPMENT_ISSUES"
                  value={ns.slackEquipmentWebhookUrl || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notificationSettings: {
                        ...ns,
                        slackEquipmentWebhookUrl: e.target.value,
                      },
                    })
                  }
                />
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  {SLACK_TEST_FOOTER}
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    disabled={testing !== null}
                    onClick={() => handleTestSlack("rad_cab")}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    {testing === "rad_cab" ? "Sending…" : "Test rad-cab"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    disabled={testing !== null}
                    onClick={() => handleTestSlack("equipment")}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    {testing === "equipment" ? "Sending…" : "Test equipment"}
                  </Button>
                </div>
                {testResult && (
                  <p className="text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-lg p-3">
                    {testResult}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Button size="lg" className="w-full" onClick={handleSave}>
          <Save className="h-5 w-5 mr-2" />
          {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
