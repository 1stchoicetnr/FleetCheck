"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { OfficePinGate } from "@/components/office-pin-gate";
import { useAuth } from "@/hooks/use-auth";
import { canReviewCheckout } from "@/lib/fleet-config";
import {
  fetchCompanies,
  fetchVehicles,
  setVehicleArchived,
  SharedVehicle,
} from "@/lib/checkout-api";
import { getStoredOfficePin } from "@/lib/office-auth";
import { Company } from "@/lib/types";
import { formatDate, formatMileage, formatUnitLabel } from "@/lib/utils";
import { isVehicleArchived } from "@/lib/vehicle-archive";
import { Archive, ArchiveRestore, Truck } from "lucide-react";

type UnitFilter = "active" | "archived" | "all";

export default function OfficeUnitsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vehicles, setVehicles] = useState<SharedVehicle[]>([]);
  const [loadError, setLoadError] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [filter, setFilter] = useState<UnitFilter>("active");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  const loadUnits = useCallback(() => {
    Promise.all([fetchCompanies(), fetchVehicles(undefined, { includeArchived: true })])
      .then(([c, v]) => {
        setCompanies(c);
        setVehicles(v);
        setLoadError("");
      })
      .catch((err: Error) => {
        setLoadError(err.message || "Could not load units from the shared server.");
      });
  }, []);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));

  const filtered = useMemo(() => {
    return vehicles
      .filter((v) => {
        if (companyId !== "all" && v.companyId !== companyId) return false;
        if (filter === "active") return !isVehicleArchived(v);
        if (filter === "archived") return isVehicleArchived(v);
        return true;
      })
      .sort((a, b) =>
        a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
      );
  }, [vehicles, companyId, filter]);

  const archivedCount = vehicles.filter(isVehicleArchived).length;

  const handleToggle = async (vehicle: SharedVehicle) => {
    const archived = !isVehicleArchived(vehicle);
    const label = formatUnitLabel(vehicle.unitNumber, vehicle.plate);
    const ok = window.confirm(
      archived
        ? `Archive ${label}? Drivers will no longer see it in Checkout. Past reports stay in Office.`
        : `Unarchive ${label}? Drivers will see it again in Checkout.`
    );
    if (!ok) return;
    setSavingId(vehicle.id);
    setActionError("");
    try {
      const updated = await setVehicleArchived(
        vehicle.id,
        archived,
        getStoredOfficePin()
      );
      setVehicles((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not update this unit."
      );
    } finally {
      setSavingId(null);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Office — Units" backHref="/office" />
      <OfficePinGate>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {loadError && (
            <p className="text-sm text-red-600 font-medium">{loadError}</p>
          )}
          {actionError && (
            <p className="text-sm text-red-600 font-medium">{actionError}</p>
          )}

          <div>
            <h2 className="text-xl font-bold text-gray-900">Units</h2>
            <p className="text-sm text-gray-500">
              Archive vans that are no longer in service. Checkout and Office
              unit pickers hide archived units. Past checkout reports stay
              visible.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {vehicles.length} units · {archivedCount} archived · PIN-gated
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className="rounded-xl border border-gray-200 px-3 py-3 text-sm bg-white min-h-[48px]"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="all">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              {(
                [
                  ["active", "Active"],
                  ["archived", "Archived"],
                  ["all", "All"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`flex-1 min-h-[48px] rounded-xl border text-sm font-semibold ${
                    filter === value
                      ? "border-brand-600 bg-brand-50 text-brand-800"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Truck className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No units match.</p>
            </div>
          ) : (
            filtered.map((vehicle) => {
              const archived = isVehicleArchived(vehicle);
              const company = companyMap[vehicle.companyId];
              return (
                <Card key={vehicle.id}>
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {formatUnitLabel(vehicle.unitNumber, vehicle.plate)}
                        </CardTitle>
                        <p className="text-sm text-gray-600">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {company?.name ?? "Company"}
                          {vehicle.lastMileage != null
                            ? ` · ${formatMileage(vehicle.lastMileage)}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          archived
                            ? "bg-gray-200 text-gray-700"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {archived ? "Archived" : "Active"}
                      </span>
                    </div>
                    {archived && vehicle.archivedAt && (
                      <p className="text-xs text-gray-500">
                        Out of service since {formatDate(vehicle.archivedAt)}
                      </p>
                    )}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={archived ? "primary" : "outline"}
                        className="w-full"
                        disabled={savingId === vehicle.id}
                        onClick={() => handleToggle(vehicle)}
                      >
                        {archived ? (
                          <ArchiveRestore className="h-4 w-4 mr-1.5" />
                        ) : (
                          <Archive className="h-4 w-4 mr-1.5" />
                        )}
                        {savingId === vehicle.id
                          ? "Saving…"
                          : archived
                            ? "Unarchive"
                            : "Archive"}
                      </Button>
                      <Link href={`/office?unitId=${vehicle.id}`} className="w-full">
                        <Button type="button" size="sm" variant="secondary" className="w-full">
                          View reports
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </OfficePinGate>
    </div>
  );
}
