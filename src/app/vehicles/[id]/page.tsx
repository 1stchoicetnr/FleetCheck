"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  getVehicleById,
  getFleetById,
  getChecksByVehicleSorted,
  getMaintenanceLogsByVehicle,
} from "@/lib/storage";
import {
  canManageVehicleMaintenance,
  canViewVehicleHistory,
  canExportHistory,
} from "@/lib/fleet-config";
import { Vehicle, Fleet, CheckRecord, MaintenanceLogEntry, FUEL_LEVEL_LABELS } from "@/lib/types";
import { formatDate, formatMileage } from "@/lib/utils";
import { OilChangeStatusBadge } from "@/components/oil-change-status";
import { OilChangeEditor } from "@/components/oil-change-editor";
import { MaintenanceLogSection } from "@/components/maintenance-log-section";
import { PhotoComparison } from "@/components/photo-comparison";
import { checksToCsv, downloadCsv } from "@/lib/export-checks";
import { Download } from "lucide-react";

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const vehicleId = params.id as string;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [checks, setChecks] = useState<CheckRecord[]>([]);
  const [logs, setLogs] = useState<MaintenanceLogEntry[]>([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canViewVehicleHistory(user.role)) router.replace("/vehicles");
  }, [user, loading, router]);

  useEffect(() => {
    async function load() {
      const v = await getVehicleById(vehicleId);
      if (!v) return;
      setVehicle(v);
      const f = await getFleetById(v.fleetId);
      if (f) setFleet(f);
      const [c, l] = await Promise.all([
        getChecksByVehicleSorted(vehicleId),
        getMaintenanceLogsByVehicle(vehicleId),
      ]);
      setChecks(c);
      setLogs(l);
    }
    load();
  }, [vehicleId]);

  if (loading || !user) return null;
  if (!vehicle) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Vehicle not found.</p>
      </div>
    );
  }

  const canMaintain = canManageVehicleMaintenance(user.role);
  const currentMi = vehicle.lastMileage ?? 0;
  const checkIns = checks.filter((c) => c.type === "check_in");

  const exportCsv = () => {
    const map = { [vehicle.id]: vehicle };
    const csv = checksToCsv(checks, map);
    downloadCsv(csv, `fleetcheck-${vehicle.plate}-history.csv`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title={vehicle.plate} backHref="/vehicles" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex justify-between gap-2">
              <div>
                <CardTitle>
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </CardTitle>
                {fleet && (
                  <p className="text-sm text-gray-500">{fleet.name}</p>
                )}
              </div>
              <StatusBadge status={vehicle.status} />
            </div>
            {vehicle.lastMileage != null && (
              <p className="text-sm text-gray-600">
                Last mileage: {formatMileage(vehicle.lastMileage)}
              </p>
            )}
            <OilChangeStatusBadge vehicle={vehicle} currentMileage={currentMi} />
            {canMaintain && (
              <OilChangeEditor
                vehicle={vehicle}
                canEdit
                onUpdated={setVehicle}
              />
            )}
          </CardContent>
        </Card>

        <MaintenanceLogSection
          vehicle={vehicle}
          logs={logs}
          canEdit={canMaintain}
          userId={user.id}
          userName={user.name}
          onLogsChange={setLogs}
          onVehicleUpdated={setVehicle}
        />

        {checkIns.length >= 2 && (
          <Card>
            <CardContent className="py-4 space-y-3">
              <CardTitle className="text-base">Photo comparison</CardTitle>
              <p className="text-sm text-gray-500">
                Compare check-in photos side by side.
              </p>
              <PhotoComparison checkIns={checkIns} />
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">Check history</h3>
            {canExportHistory(user.role) && checks.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            )}
          </div>
          {checks.length === 0 ? (
            <p className="text-sm text-gray-500">No check records yet.</p>
          ) : (
            checks.map((c) => (
              <Card key={c.id}>
                <CardContent className="py-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="font-semibold capitalize">
                      {c.type.replace("_", " ")}
                    </span>
                    <span className="text-gray-500">{formatDate(c.createdAt)}</span>
                  </div>
                  <p className="text-gray-600">{c.driverName}</p>
                  <p className="text-gray-500">
                    {formatMileage(c.startOdometer)}
                    {c.endOdometer != null && ` → ${formatMileage(c.endOdometer)}`}
                    {c.fuelLevel && (
                      <> · Fuel: {FUEL_LEVEL_LABELS[c.fuelLevel]}</>
                    )}
                  </p>
                  {c.notes && (
                    <p className="text-gray-600 italic">Notes: {c.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Link href="/vehicles">
          <Button variant="secondary" className="w-full">
            Back to fleet
          </Button>
        </Link>
      </div>
    </div>
  );
}
