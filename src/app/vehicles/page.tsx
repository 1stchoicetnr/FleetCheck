"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  getVehicles,
  getFleets,
  getChecks,
  updateVehicleStatus,
  getFleetById,
} from "@/lib/storage";
import { canUpdateStatus, canManageKnownIssues, canViewVehicleHistory, canViewFleetOverview, canManageVehicleMaintenance } from "@/lib/fleet-config";
import { buildLastCheckMap, formatLastCheckLine } from "@/lib/vehicle-check-status";
import { dispatchStatusChangeAlert } from "@/lib/alerts";
import { Vehicle, Fleet, VehicleStatus, FLEET_TYPE_LABELS, FLEET_TYPES, CheckRecord, STATUS_LABELS, fleetTypeLabel, normalizeFleetType } from "@/lib/types";
import { formatMileage } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { KnownIssueEditor } from "@/components/known-issue-editor";
import { OilChangeStatusBadge } from "@/components/oil-change-status";
import { OilChangeEditor } from "@/components/oil-change-editor";
import { VehicleStatusControls } from "@/components/vehicle-status-controls";
import { MANUAL_VEHICLE_STATUSES, VEHICLE_STATUSES } from "@/lib/vehicle-status";

const STATUS_PARAM_VALUES = new Set<string>([
  "all",
  ...VEHICLE_STATUSES,
]);

function VehiclesPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [checks, setChecks] = useState<CheckRecord[]>([]);
  const [filter, setFilter] = useState<VehicleStatus | "all">("all");
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  useEffect(() => {
    const status = searchParams.get("status");
    if (status && STATUS_PARAM_VALUES.has(status)) {
      setFilter(status as VehicleStatus | "all");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    Promise.all([getVehicles(), getFleets(), getChecks()]).then(([v, f, c]) => {
      setVehicles(v);
      setFleets(f);
      setChecks(c);
    });
  }, []);

  const lastCheckMap = buildLastCheckMap(checks);

  const fleetMap = Object.fromEntries(fleets.map((f) => [f.id, f]));
  const filtered =
    filter === "all" ? vehicles : vehicles.filter((v) => v.status === filter);

  const statusCounts = vehicles.reduce(
    (acc, v) => {
      acc[v.status] = (acc[v.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<VehicleStatus, number>
  );

  const fleetOverview = user ? canViewFleetOverview(user.role) : false;

  const fleetGroups = fleetOverview
    ? FLEET_TYPES.map((type) => ({
        type,
        label: FLEET_TYPE_LABELS[type],
        vehicles: filtered.filter((v) => {
          const fleet = fleetMap[v.fleetId];
          return fleet && normalizeFleetType(fleet.type) === type;
        }),
      })).filter((g) => g.vehicles.length > 0)
    : [{ type: "all" as const, label: "", vehicles: filtered }];

  const renderVehicleCard = (v: Vehicle) => {
    const fleet = fleetMap[v.fleetId];
    const lastCheck = lastCheckMap.get(v.id);
    const fleetLabel = fleet ? fleetTypeLabel(fleet.type) : null;
    const fleetSubtitle =
      fleet && fleetLabel && fleet.name.trim().toLowerCase() !== fleetLabel.toLowerCase()
        ? `${fleet.name} · ${fleetLabel}`
        : fleetLabel ?? fleet?.name;

    return (
      <Card key={v.id}>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>{v.plate}</CardTitle>
              <p className="text-sm text-gray-600">
                {v.year} {v.make} {v.model}
              </p>
              {fleetSubtitle && (
                <p className="text-xs text-gray-400 mt-1">{fleetSubtitle}</p>
              )}
            </div>
            <StatusBadge status={v.status} />
          </div>

          {lastCheck && (
            <p className="text-xs text-gray-500">
              {formatLastCheckLine(lastCheck)}
            </p>
          )}

          {v.lastMileage != null && (
            <p className="text-sm text-gray-500">
              Mileage: {formatMileage(v.lastMileage)}
            </p>
          )}

          {v.lastMileage != null && fleetOverview && (
            <OilChangeStatusBadge
              vehicle={v}
              currentMileage={v.lastMileage}
              compact
            />
          )}

          {fleetOverview && canManageVehicleMaintenance(user!.role) && (
            <OilChangeEditor
              vehicle={v}
              canEdit
              onUpdated={(updated) =>
                setVehicles((prev) =>
                  prev.map((item) => (item.id === updated.id ? updated : item))
                )
              }
            />
          )}

          {(fleetOverview || (v.knownIssue?.isOpen && v.knownIssue.text.trim())) && (
            <KnownIssueEditor
              vehicle={v}
              canEdit={canManageKnownIssues(user!.role)}
              userId={user!.id}
              userName={user!.name}
              onUpdated={(updated) =>
                setVehicles((prev) =>
                  prev.map((item) => (item.id === updated.id ? updated : item))
                )
              }
            />
          )}

          {canUpdateStatus(user!.role) && (
            <VehicleStatusControls
              current={v.status}
              disabled={statusSavingId === v.id}
              onChange={(status) => handleStatusChange(v.id, status)}
            />
          )}

          {canViewVehicleHistory(user!.role) && (
            <Link href={`/vehicles/${v.id}`}>
              <Button size="sm" variant="outline" className="w-full">
                History & maintenance
              </Button>
            </Link>
          )}

          {user!.role === "driver" &&
            (v.status === "ready" ||
              v.status === "checked_out" ||
              v.status === "needs_work") && (
              <Link href={`/check-in?vehicleId=${v.id}`}>
                <Button size="md" className="w-full">
                  Check In / Out
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            )}
        </CardContent>
      </Card>
    );
  };

  const handleStatusChange = async (id: string, status: VehicleStatus) => {
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle || !user) return;
    if (!(MANUAL_VEHICLE_STATUSES as VehicleStatus[]).includes(status)) return;
    setStatusSavingId(id);
    const previousStatus = vehicle.status;
    try {
      await updateVehicleStatus(id, status);
      setVehicles((prev) =>
        prev.map((v) => (v.id === id ? { ...v, status } : v))
      );
      const fleet = await getFleetById(vehicle.fleetId);
      if (fleet) {
        await dispatchStatusChangeAlert(
          { ...vehicle, status },
          normalizeFleetType(fleet.type),
          user.name,
          status,
          previousStatus
        );
      }
    } finally {
      setStatusSavingId(null);
    }
  };

  if (loading || !user) return null;

  const pageTitle = fleetOverview ? "Fleet Overview" : "Vehicles";

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title={pageTitle} />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {fleetOverview && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["all", ...VEHICLE_STATUSES] as const).map((s) => {
              const count =
                s === "all"
                  ? vehicles.length
                  : statusCounts[s as VehicleStatus] ?? 0;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
                    filter === s
                      ? "bg-brand-600 text-white"
                      : "bg-white text-gray-600 border border-gray-200"
                  }`}
                >
                  {s === "all" ? "All" : STATUS_LABELS[s]} ({count})
                </button>
              );
            })}
          </div>
        )}

        <div className="space-y-6">
          {fleetGroups.map((group) => (
            <div key={String(group.type)} className="space-y-3">
              {group.label ? (
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                  {group.label}
                </h2>
              ) : null}
              {group.vehicles.map((v) => renderVehicleCard(v))}
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-center text-gray-500 py-8">No vehicles found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VehiclesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-brand-600">Loading...</div>
        </div>
      }
    >
      <VehiclesPageContent />
    </Suspense>
  );
}
