"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { canViewReports } from "@/lib/fleet-config";
import {
  getChecks,
  getVehicles,
  getFleets,
  getVehicleById,
  getFleetById,
} from "@/lib/storage";
import { CheckRecord, Vehicle, Fleet } from "@/lib/types";
import { formatDate, formatMileage } from "@/lib/utils";
import { generateCheckPDF, downloadPDF } from "@/lib/pdf";
import { Download, FileText } from "lucide-react";

export default function ReportsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [checks, setChecks] = useState<CheckRecord[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [fleets, setFleets] = useState<Record<string, Fleet>>({});

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canViewReports(user.role) && user.role !== "tech") {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function load() {
      const [c, v, f] = await Promise.all([
        getChecks(),
        getVehicles(),
        getFleets(),
      ]);
      setChecks(c.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setVehicles(Object.fromEntries(v.map((x) => [x.id, x])));
      setFleets(Object.fromEntries(f.map((x) => [x.id, x])));
    }
    load();
  }, []);

  const handleDownload = async (check: CheckRecord) => {
    const vehicle = vehicles[check.vehicleId] || (await getVehicleById(check.vehicleId));
    const fleet = fleets[check.fleetId] || (await getFleetById(check.fleetId));
    if (!vehicle || !fleet) return;
    const blob = await generateCheckPDF(check, vehicle, fleet);
    downloadPDF(blob, `fleetcheck-${vehicle.plate}-${check.id}.pdf`);
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Reports" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{checks.length} records</p>
        </div>

        {checks.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No check records yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Records appear here after drivers complete check-ins.
            </p>
          </div>
        ) : (
          checks.map((check) => {
            const vehicle = vehicles[check.vehicleId];
            return (
              <Card key={check.id}>
                <CardContent className="py-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {vehicle?.plate || "Unknown"} —{" "}
                        <span className="capitalize">
                          {check.type.replace("_", " ")}
                        </span>
                      </CardTitle>
                      <p className="text-sm text-gray-500">
                        {check.driverName} · {formatDate(check.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${
                        check.conditionRating === "good"
                          ? "bg-green-100 text-green-700"
                          : check.conditionRating === "fair"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {check.conditionRating}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 flex gap-4">
                    <span>{formatMileage(check.startOdometer)}</span>
                    {check.maintenanceIssues.length > 0 && (
                      <span className="text-orange-600">
                        {check.maintenanceIssues.length} issue
                        {check.maintenanceIssues.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(check)}
                    className="w-full mt-2"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
