"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { canViewFleetOverview } from "@/lib/fleet-config";
import {
  FIRST_CHOICE_COMPANY_ID,
  OTHER_FLEETS_COMPANY_ID,
  RAD_CAB_COMPANY_ID,
  SEEDED_COMPANIES,
  TURO_COMPANY_ID,
} from "@/lib/companies";
import { fetchVehicles, SharedVehicle } from "@/lib/checkout-api";
import { summarizeUnits, unitCountLine } from "@/lib/unit-counts";
import { formatMileage, formatUnitLabel } from "@/lib/utils";
import { UnitImportNote } from "@/components/unit-import-note";

const GROUPS = [
  { id: RAD_CAB_COMPANY_ID, label: "Taxi / Rad Cab" },
  { id: FIRST_CHOICE_COMPANY_ID, label: "Tow" },
  { id: TURO_COMPANY_ID, label: "Turo" },
  { id: OTHER_FLEETS_COMPANY_ID, label: "Service" },
];

function VehiclesPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<SharedVehicle[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [companyId, setCompanyId] = useState("all");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    const companyIds = SEEDED_COMPANIES.map((company) => company.id);
    Promise.all(companyIds.map((id) => fetchVehicles(id, { includeArchived: true })))
      .then((lists) => {
        const byId = new Map<string, SharedVehicle>();
        for (const list of lists) {
          for (const vehicle of list) byId.set(vehicle.id, vehicle);
        }
        setVehicles([...byId.values()]);
        setError("");
      })
      .catch((err: Error) => setError(err.message || "Could not load units."))
      .finally(() => setReady(true));
  }, []);

  const summary = useMemo(() => summarizeUnits(vehicles), [vehicles]);
  const visible = useMemo(() => {
    return vehicles
      .filter((vehicle) => companyId === "all" || vehicle.companyId === companyId)
      .filter((vehicle) => !vehicle.archivedAt)
      .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
  }, [vehicles, companyId]);

  if (loading || !user) return null;

  const overview = canViewFleetOverview(user.role);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title={overview ? "Fleet" : "Vehicles"} />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <UnitImportNote />
        <p className="text-sm text-gray-600">
          {ready ? unitCountLine(summary) : "Loading units…"}
        </p>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={companyId === "all"} onClick={() => setCompanyId("all")}>
            All
          </FilterChip>
          {GROUPS.map((group) => (
            <FilterChip
              key={group.id}
              active={companyId === group.id}
              onClick={() => setCompanyId(group.id)}
            >
              {group.label}
            </FilterChip>
          ))}
        </div>
        {!ready ? (
          <p className="text-center text-gray-500 py-8">Loading units…</p>
        ) : visible.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No active units in this list.</p>
        ) : (
          GROUPS.filter((group) => companyId === "all" || companyId === group.id).map((group) => {
            const rows = visible.filter((vehicle) => vehicle.companyId === group.id);
            if (rows.length === 0) return null;
            return (
              <section key={group.id} className="space-y-3">
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                  {group.label}
                  <span className="ml-2 font-medium normal-case text-gray-400">
                    {summary.byCompany[group.id]?.active ?? 0} active
                  </span>
                </h2>
                {rows.map((vehicle) => (
                  <Card key={vehicle.id}>
                    <CardContent className="py-4 space-y-3">
                      <div>
                        <CardTitle>{formatUnitLabel(vehicle.unitNumber, vehicle.plate)}</CardTitle>
                        <p className="text-sm text-gray-600">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                          {vehicle.powertrain === "ev" ? " · EV" : ""}
                        </p>
                        {vehicle.lastMileage != null && (
                          <p className="text-sm text-gray-500 mt-1">
                            Mileage: {formatMileage(vehicle.lastMileage)}
                          </p>
                        )}
                      </div>
                      <Link href="/checkout">
                        <Button size="sm" className="w-full">Checkout Report</Button>
                      </Link>
                      {overview && (
                        <Link href={`/office?unitId=${vehicle.id}`}>
                          <Button size="sm" variant="outline" className="w-full">
                            Office reports
                          </Button>
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </section>
            );
          })
        )}
        {ready &&
          visible
            .filter((vehicle) => !GROUPS.some((group) => group.id === vehicle.companyId))
            .map((vehicle) => (
              <Card key={vehicle.id}>
                <CardContent className="py-4">
                  <CardTitle>{formatUnitLabel(vehicle.unitNumber, vehicle.plate)}</CardTitle>
                  <p className="text-sm text-gray-600">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    This company is not one of the taxi, tow, Turo, or service fleets.
                  </p>
                </CardContent>
              </Card>
            ))}
        {overview && (
          <Link href="/office/units">
            <Button variant="secondary" className="w-full">Archive or restore a unit</Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
        active ? "bg-brand-600 text-white" : "bg-white text-gray-600 border border-gray-200"
      }`}
    >
      {children}
    </button>
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
