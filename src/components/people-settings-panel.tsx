"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCompanies } from "@/lib/storage";
import {
  fetchAppUsers,
  fetchCompanies,
  fetchFleetSettings,
  fetchVehicles,
  updateFleetSettings,
} from "@/lib/checkout-api";
import { Company } from "@/lib/types";
import { summarizeUnits, unitCountLine, UnitCounts } from "@/lib/unit-counts";
import Link from "next/link";
import { Users, Truck } from "lucide-react";
import { UnitImportNote } from "@/components/unit-import-note";
import { AccessRequestsPanel } from "@/components/access-requests-panel";

export function PeopleSettingsPanel({ owner }: { owner: boolean }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [unitSummary, setUnitSummary] = useState<UnitCounts | null>(null);
  const [serverUserCount, setServerUserCount] = useState<number | null>(null);
  const [unitsError, setUnitsError] = useState("");
  const [allowDriverAdd, setAllowDriverAdd] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    if (!owner) return;
    getCompanies().then((companiesList) => {
      setCompanies((current) => (current.length > 0 ? current : companiesList));
    });
    Promise.all([
      fetchVehicles(undefined, { includeArchived: true }),
      fetchCompanies(),
      fetchAppUsers(),
    ])
      .then(([list, serverCompanies, serverUsers]) => {
        setUnitSummary(summarizeUnits(list));
        setCompanies(serverCompanies);
        setServerUserCount(serverUsers.length);
        setUnitsError("");
      })
      .catch((err: Error) => {
        setUnitsError(err.message || "Could not load checkout units.");
      });
    fetchFleetSettings()
      .then((settings) => {
        setAllowDriverAdd(settings.allowDriverAddVehicles);
        setSettingsError("");
      })
      .catch((err: Error) => {
        setSettingsError(err.message || "Could not load Super Admin settings.");
      });
  }, [owner]);

  return (
    <div id="people" className="space-y-4">
      <AccessRequestsPanel canGrantOwner={owner} canResetPassword={owner} />
      {owner && (
      <>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Companies", value: companies.length, icon: Truck, href: "/vehicles" },
            {
              label: "Active units",
              value: unitSummary ? unitSummary.active : "…",
              icon: Truck,
              href: "/vehicles",
            },
            {
              label: "Users",
              value: serverUserCount ?? "…",
              icon: Users,
              href: "/admin/users",
            },
          ].map((stat) => (
            <Link key={stat.label} href={stat.href}>
              <Card>
                <CardContent className="py-4 text-center">
                  <stat.icon className="h-5 w-5 mx-auto text-brand-600 mb-1" />
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <p className="text-sm text-gray-600 -mt-3">
          {unitSummary
            ? unitCountLine(unitSummary)
            : unitsError
              ? "Unlock Office to load the shared unit count."
              : "Loading units…"}
        </p>
        <Link href="/admin/users">
          <Button size="lg" variant="secondary" className="w-full">
            <Users className="h-5 w-5 mr-2" />
            Add or edit users
          </Button>
        </Link>

        {/* Add Vehicle */}
        <Link href="/office/people">
          <Button size="lg" variant="secondary" className="w-full">
            <Users className="h-5 w-5 mr-2" />
            People and invites
          </Button>
        </Link>

        <Card>
          <CardContent className="py-5 space-y-3">
            <CardTitle>Driver settings</CardTitle>
            <p className="text-xs text-gray-500">
              Drivers can always pick an existing active unit. Adding a brand-new
              plate from Checkout is off unless you turn this on.
            </p>
            {settingsError && (
              <p className="text-sm font-medium text-red-600">{settingsError}</p>
            )}
            <button
              type="button"
              disabled={settingsSaving}
              onClick={async () => {
                const next = !allowDriverAdd;
                setSettingsSaving(true);
                setSettingsError("");
                try {
                  const settings = await updateFleetSettings({
                    allowDriverAddVehicles: next,
                  });
                  setAllowDriverAdd(settings.allowDriverAddVehicles);
                } catch (err) {
                  setSettingsError(
                    err instanceof Error
                      ? err.message
                      : "Could not save this setting."
                  );
                } finally {
                  setSettingsSaving(false);
                }
              }}
              className={`w-full min-h-[52px] rounded-xl border-2 px-4 text-left ${
                allowDriverAdd
                  ? "border-brand-600 bg-brand-50 text-brand-900"
                  : "border-gray-200 bg-white text-gray-800"
              }`}
            >
              <span className="block font-semibold">
                Allow drivers to add vehicles
              </span>
              <span className="block text-xs mt-0.5">
                {settingsSaving
                  ? "Saving…"
                  : allowDriverAdd
                    ? "On — Checkout shows “Plate not listed? Add unit / plate”."
                    : "Off — drivers must pick from the active unit list (default)."}
              </span>
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5 space-y-3">
            <CardTitle>Companies</CardTitle>
            <p className="text-xs text-gray-500">
              Tenants. Each company can use its own checkout checklist later.
              Rad Cab is seeded first with the photo walkaround policy.
            </p>
            {companies.map((c) => (
              <div
                key={c.id}
                className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    Checklist: {c.checklistId}
                  </p>
                </div>
                <span className="text-sm text-gray-400">
                  {unitSummary
                    ? `${unitSummary.byCompany[c.id]?.active ?? 0} active`
                    : "…"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <UnitImportNote />
        <Card>
          <CardContent className="py-5 space-y-3">
            <CardTitle>Fleet vehicles</CardTitle>
            <p className="text-sm text-gray-600">
              The shared Units list is the fleet. Taxi, tow, Turo, and service
              vehicles live there. The old on-device list is no longer shown.
            </p>
            <Link href="/vehicles">
              <Button variant="secondary" className="w-full">Open vehicles</Button>
            </Link>
          </CardContent>
        </Card>
      </>
      )}
    </div>
  );
}

