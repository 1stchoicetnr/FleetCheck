"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { canViewReports } from "@/lib/fleet-config";
import { getChecks, getVehicles } from "@/lib/storage";
import { CheckRecord, Vehicle, MAINTENANCE_ISSUES } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, Bell } from "lucide-react";

export default function AlertsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [alerts, setAlerts] = useState<
    { type: string; message: string; date: string; vehicle?: string }[]
  >([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canViewReports(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    async function load() {
      const [checks, vehicles] = await Promise.all([
        getChecks(),
        getVehicles(),
      ]);
      const vehicleMap = Object.fromEntries(vehicles.map((v) => [v.id, v]));
      const items: typeof alerts = [];

      for (const v of vehicles) {
        if (v.status === "out_of_service") {
          items.push({
            type: "critical",
            message: `${v.plate} is out of service`,
            date: v.createdAt,
            vehicle: v.plate,
          });
        } else if (v.status === "needs_work") {
          items.push({
            type: "warning",
            message: `${v.plate} needs maintenance`,
            date: v.createdAt,
            vehicle: v.plate,
          });
        }
      }

      for (const check of checks) {
        if (check.conditionRating === "poor") {
          const v = vehicleMap[check.vehicleId];
          items.push({
            type: "critical",
            message: `Poor condition reported on ${v?.plate || "vehicle"}`,
            date: check.createdAt,
            vehicle: v?.plate,
          });
        }
        for (const issue of check.maintenanceIssues) {
          const label =
            MAINTENANCE_ISSUES.find((m) => m.id === issue)?.label ?? issue;
          const v = vehicleMap[check.vehicleId];
          items.push({
            type: "warning",
            message: `${label} reported on ${v?.plate || "vehicle"}`,
            date: check.createdAt,
            vehicle: v?.plate,
          });
        }
      }

      items.sort((a, b) => b.date.localeCompare(a.date));
      setAlerts(items.slice(0, 50));
    }
    load();
  }, []);

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Alerts" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {alerts.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No active alerts.</p>
            <p className="text-sm text-gray-400 mt-1">All vehicles look good!</p>
          </div>
        ) : (
          alerts.map((alert, i) => (
            <Card
              key={i}
              className={
                alert.type === "critical"
                  ? "border-red-200 bg-red-50/50"
                  : "border-yellow-200 bg-yellow-50/50"
              }
            >
              <CardContent className="py-4 flex items-start gap-3">
                <AlertTriangle
                  className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                    alert.type === "critical" ? "text-red-500" : "text-yellow-500"
                  }`}
                />
                <div>
                  <CardTitle className="text-sm">{alert.message}</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDate(alert.date)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
