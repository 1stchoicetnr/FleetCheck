"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  getVehicles,
  getFleets,
  updateVehicleStatus,
} from "@/lib/storage";
import { canUpdateStatus } from "@/lib/fleet-config";
import { Vehicle, Fleet, VehicleStatus, FLEET_TYPE_LABELS } from "@/lib/types";
import { formatMileage } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function VehiclesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [filter, setFilter] = useState<VehicleStatus | "all">("all");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    Promise.all([getVehicles(), getFleets()]).then(([v, f]) => {
      setVehicles(v);
      setFleets(f);
    });
  }, []);

  const fleetMap = Object.fromEntries(fleets.map((f) => [f.id, f]));
  const filtered =
    filter === "all" ? vehicles : vehicles.filter((v) => v.status === filter);

  const handleStatusChange = async (id: string, status: VehicleStatus) => {
    await updateVehicleStatus(id, status);
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, status } : v))
    );
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Vehicles" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["all", "ready", "needs_work", "out_of_service"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
                  filter === s
                    ? "bg-brand-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200"
                }`}
              >
                {s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </button>
            )
          )}
        </div>

        <div className="space-y-3">
          {filtered.map((v) => {
            const fleet = fleetMap[v.fleetId];
            return (
              <Card key={v.id}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{v.plate}</CardTitle>
                      <p className="text-sm text-gray-600">
                        {v.year} {v.make} {v.model}
                      </p>
                      {fleet && (
                        <p className="text-xs text-gray-400 mt-1">
                          {fleet.name} · {FLEET_TYPE_LABELS[fleet.type]}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={v.status} />
                  </div>

                  {v.lastMileage && (
                    <p className="text-sm text-gray-500">
                      Mileage: {formatMileage(v.lastMileage)}
                    </p>
                  )}

                  {canUpdateStatus(user.role) && (
                    <div className="flex gap-2">
                      {(["ready", "needs_work", "out_of_service"] as VehicleStatus[]).map(
                        (s) => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(v.id, s)}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium border ${
                              v.status === s
                                ? "border-brand-600 bg-brand-50 text-brand-700"
                                : "border-gray-200 text-gray-600"
                            }`}
                          >
                            {s.replace(/_/g, " ")}
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {user.role === "driver" && v.status === "ready" && (
                    <Link href="/check-in">
                      <Button size="md" className="w-full">
                        Check In / Out
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-center text-gray-500 py-8">No vehicles found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
