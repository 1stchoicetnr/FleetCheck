"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { canManageFleet, canManageKnownIssues } from "@/lib/fleet-config";
import {
  getFleets,
  getUsers,
  getVehicles,
  getChecks,
} from "@/lib/storage";
import { Fleet, User, Vehicle, fleetTypeLabel } from "@/lib/types";
import Link from "next/link";
import { buildLastCheckMap, formatLastCheckLine } from "@/lib/vehicle-check-status";
import { Plus, Bell, Users, Truck } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/utils";
import { KnownIssueEditor } from "@/components/known-issue-editor";
import { hasOpenKnownIssue } from "@/lib/known-issue";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof getChecks>>>([]);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canManageFleet(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    Promise.all([getFleets(), getUsers(), getVehicles(), getChecks()]).then(
      ([f, u, v, c]) => {
        setFleets(f);
        setUsers(u);
        setVehicles(v);
        setChecks(c);
      }
    );
  }, []);

  if (loading || !user) return null;

  const lastCheckMap = buildLastCheckMap(checks);
  const fleetMap = Object.fromEntries(fleets.map((f) => [f.id, f]));

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
                    {fleetTypeLabel(f.type)}
                  </p>
                </div>
                <span className="text-sm text-gray-400">
                  {vehicles.filter((v) => v.fleetId === f.id).length} vehicles
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Fleet vehicles */}
        <Card>
          <CardContent className="py-5 space-y-3">
            <CardTitle>Fleet Vehicles</CardTitle>
            <p className="text-xs text-gray-500">
              Current status for each vehicle in the fleet.
            </p>
            {vehicles.map((v) => {
              const fleet = fleetMap[v.fleetId];
              const lastCheck = lastCheckMap.get(v.id);
              return (
                <div
                  key={v.id}
                  className="py-3 border-b border-gray-100 last:border-0 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{v.plate}</p>
                      <p className="text-xs text-gray-500">
                        {v.year} {v.make} {v.model}
                        {fleet ? ` · ${fleet.name}` : ""}
                      </p>
                    </div>
                    <StatusBadge status={v.status} />
                  </div>
                  {lastCheck && (
                    <p className="text-xs text-gray-400">
                      {formatLastCheckLine(lastCheck)}
                    </p>
                  )}
                  {hasOpenKnownIssue(v) && (
                    <p className="text-xs text-amber-800 font-medium">
                      Known issue: {v.knownIssue!.text.trim()}
                    </p>
                  )}
                  {user && canManageKnownIssues(user.role) && (
                    <KnownIssueEditor
                      vehicle={v}
                      canEdit
                      userId={user.id}
                      userName={user.name}
                      onUpdated={(updated) =>
                        setVehicles((prev) =>
                          prev.map((item) => (item.id === updated.id ? updated : item))
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
            {vehicles.length === 0 && (
              <p className="text-sm text-gray-500">No vehicles registered.</p>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Link href="/alerts/settings">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="py-5 flex items-center gap-3">
              <Bell className="h-6 w-6 text-brand-600" />
              <div>
                <CardTitle className="text-base">Alert Settings</CardTitle>
                <p className="text-sm text-gray-500">
                  Configure in-app and Slack alerts
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
