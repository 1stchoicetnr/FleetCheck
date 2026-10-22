"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCompanies, fetchCompanySettings, saveCompanySettings } from "@/lib/checkout-api";
import {
  CHECKOUT_SLACK_FLEETS,
  defaultCheckoutSlackRoute,
  type CheckoutSlackDestination,
  type CheckoutSlackMode,
  type CheckoutSlackRoute,
} from "@/lib/checkout-slack-route";
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

export function NotificationSettingsPanel({
  companyIds = null,
}: {
  /** Null shows every fleet. A list limits checkout posts to those companies. */
  companyIds?: string[] | null;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState<"rad_cab" | "equipment" | null>(null);
  const [routes, setRoutes] = useState<Record<string, CheckoutSlackRoute> | null>(null);
  const [routesReady, setRoutesReady] = useState(false);
  const [fleetNames, setFleetNames] = useState<Record<string, string>>({});
  const [routeError, setRouteError] = useState("");

  useEffect(() => {
    getSettings().then(setSettings);
    void fetchCompanySettings()
      .then((next) => {
        setRoutes(next.checkoutSlack);
        setRoutesReady(true);
      })
      .catch(() => {
        const fallback: Record<string, CheckoutSlackRoute> = {};
        for (const fleet of CHECKOUT_SLACK_FLEETS) {
          fallback[fleet.id] = defaultCheckoutSlackRoute(fleet.id);
        }
        setRoutes(fallback);
        setRoutesReady(false);
        setRouteError("Checkout routes could not be loaded, so they will not be saved.");
      });
    void fetchCompanies()
      .then((list) => {
        const names: Record<string, string> = {};
        for (const company of list) names[company.id] = company.name;
        setFleetNames(names);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    await saveSettings(settings);
    if (routes && routesReady) {
      try {
        const allowed = new Set(companyIds || []);
        const checkoutSlack = Object.fromEntries(
          Object.entries(routes).filter(([id]) => !companyIds || allowed.has(id))
        );
        const next = await saveCompanySettings({ checkoutSlack });
        setRoutes(next.checkoutSlack);
        setRouteError("");
      } catch (err) {
        setRouteError(err instanceof Error ? err.message : "Could not save checkout posts.");
        setSaved(false);
        return;
      }
    }
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

  if (!settings) return null;

  const ns = settings.notificationSettings;
  const fleetLimited = Array.isArray(companyIds);
  const visibleFleets = CHECKOUT_SLACK_FLEETS.filter(
    (fleet) => !fleetLimited || companyIds.includes(fleet.id)
  );
  const slackNotReady =
    ns.slackEnabled &&
    (!ns.slackRadCabWebhookUrl || !ns.slackEquipmentWebhookUrl);

  return (
    <div id="notifications" className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">Notifications</h2>
        <p className="text-sm text-muted mt-1">In-app alerts and Slack.</p>
      </div>
        {slackNotReady && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Slack is on but webhook URLs are missing. Add a webhook for each
            channel below, then tap <strong>Save Settings</strong> and{" "}
            <strong>Send test</strong>.
          </p>
        )}
        <Card>
          <CardContent className="py-5 space-y-4">
            <CardTitle>Checkout posts</CardTitle>
            <p className="text-sm text-gray-600">
              Rad Cab sends every checkout to #radcabcr. Other fleets stay quiet
              unless the check has new damage or a FAIL. Those go to Ashley as a
              direct message. Saving does not send a message.
            </p>
            {routes &&
              visibleFleets.map((fleet) => {
                const route = routes[fleet.id] ?? defaultCheckoutSlackRoute(fleet.id);
                return (
                  <div key={fleet.id} className="space-y-2 rounded-xl border border-[#3a3a40] p-3">
                    <p className="text-sm font-semibold text-ink">
                      {fleetNames[fleet.id] || fleet.name}
                    </p>
                    <label className="block text-xs font-medium text-muted">
                      When
                      <select
                        value={route.mode}
                        onChange={(event) => {
                          const mode = event.target.value as CheckoutSlackMode;
                          setRoutes({
                            ...routes,
                            [fleet.id]: { ...route, mode },
                          });
                        }}
                        className="mt-1 w-full rounded-lg border border-[#5c5c64] bg-[#1c1c1e] px-3 py-2 text-sm text-[#f7f7f8]"
                      >
                        <option value="every">Every check</option>
                        <option value="damage_or_fail">Only damage or FAIL</option>
                        <option value="off">Off</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-muted">
                      Destination
                      <select
                        value={route.destination}
                        onChange={(event) => {
                          const destination = event.target.value as CheckoutSlackDestination;
                          setRoutes({
                            ...routes,
                            [fleet.id]: { ...route, destination },
                          });
                        }}
                        className="mt-1 w-full rounded-lg border border-[#5c5c64] bg-[#1c1c1e] px-3 py-2 text-sm text-[#f7f7f8]"
                      >
                        <option value="radcabcr">#radcabcr</option>
                        <option value="ashley_dm">Ashley DM</option>
                      </select>
                    </label>
                  </div>
                );
              })}
            {routeError && <p className="text-sm font-medium text-red-700">{routeError}</p>}
          </CardContent>
        </Card>

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

        {!fleetLimited && (
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
        )}

        <Button size="lg" className="w-full" onClick={handleSave}>
          <Save className="h-5 w-5 mr-2" />
          {saved ? "Saved!" : "Save Settings"}
        </Button>
    </div>
  );
}
