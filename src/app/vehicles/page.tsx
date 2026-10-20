"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { OfficeUnitService } from "@/components/office-unit-service";
import { UnitImportNote } from "@/components/unit-import-note";
import { useAuth } from "@/hooks/use-auth";
import { canViewFleetOverview, canReviewCheckout } from "@/lib/fleet-config";
import { canAddVehicle } from "@/lib/home-menu";
import {
  FIRST_CHOICE_COMPANY_ID,
  OTHER_FLEETS_COMPANY_ID,
  RAD_CAB_COMPANY_ID,
  SEEDED_COMPANIES,
  TURO_COMPANY_ID,
} from "@/lib/companies";
import {
  fetchVehicles,
  setVehicleArchived,
  setVehiclePowertrain,
  SharedVehicle,
} from "@/lib/checkout-api";
import { getStoredOfficePin } from "@/lib/office-auth";
import { summarizeUnits, unitCountLine } from "@/lib/unit-counts";
import { formatDate, formatMileage, formatUnitLabel } from "@/lib/utils";
import { isVehicleArchived } from "@/lib/vehicle-archive";
import { Archive, ArchiveRestore, Plus } from "lucide-react";

const GROUPS = [
  { id: RAD_CAB_COMPANY_ID, label: "Taxi / Rad Cab" },
  { id: FIRST_CHOICE_COMPANY_ID, label: "Tow" },
  { id: TURO_COMPANY_ID, label: "Turo" },
  { id: OTHER_FLEETS_COMPANY_ID, label: "Service" },
];

function VehiclesPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vehicles, setVehicles] = useState<SharedVehicle[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [showArchived, setShowArchived] = useState(
    searchParams.get("filter") === "archived"
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<SharedVehicle | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    setShowArchived(searchParams.get("filter") === "archived");
  }, [searchParams]);

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
  const manage = Boolean(user && canReviewCheckout(user.role));
  const add = Boolean(user && canAddVehicle(user.role));
  const visible = useMemo(() => {
    return vehicles
      .filter((vehicle) => companyId === "all" || vehicle.companyId === companyId)
      .filter((vehicle) => (showArchived ? Boolean(vehicle.archivedAt) : !vehicle.archivedAt))
      .sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
  }, [vehicles, companyId, showArchived]);

  const toggleArchive = async (vehicle: SharedVehicle) => {
    setSavingId(vehicle.id);
    setError("");
    try {
      const updated = await setVehicleArchived(
        vehicle.id,
        !isVehicleArchived(vehicle),
        getStoredOfficePin()
      );
      setVehicles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this unit.");
    } finally {
      setSavingId(null);
    }
  };

  const setPowertrain = async (vehicle: SharedVehicle, powertrain: "gas" | "ev") => {
    if (vehicle.powertrain === powertrain) return;
    setSavingId(vehicle.id);
    setError("");
    try {
      const updated = await setVehiclePowertrain(vehicle.id, powertrain, getStoredOfficePin());
      setVehicles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this unit.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading || !user) return null;

  const overview = canViewFleetOverview(user.role);

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader title="Vehicles" backHref="/dashboard" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">Vehicles</h2>
            <p className="text-sm text-muted">
              {ready ? unitCountLine(summary) : "Loading units…"}
            </p>
          </div>
          {add && (
            <Link href="/admin/vehicles/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </Link>
          )}
        </div>
        <UnitImportNote />
        {error && <p className="text-sm font-medium text-red-400">{error}</p>}
        {manage && (
          <div className="flex gap-2">
            <FilterChip active={!showArchived} onClick={() => setShowArchived(false)}>
              Active
            </FilterChip>
            <FilterChip active={showArchived} onClick={() => setShowArchived(true)}>
              {`Archived${summary.archived ? ` ${summary.archived}` : ""}`}
            </FilterChip>
          </div>
        )}
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
          <p className="text-center text-muted py-8">Loading units…</p>
        ) : visible.length === 0 ? (
          <p className="text-center text-muted py-8">
            {showArchived ? "No archived units in this list." : "No active units in this list."}
          </p>
        ) : (
          GROUPS.filter((group) => companyId === "all" || companyId === group.id).map((group) => {
            const rows = visible.filter((vehicle) => vehicle.companyId === group.id);
            if (rows.length === 0) return null;
            return (
              <section key={group.id} className="space-y-3">
                <h2 className="text-sm font-bold text-ink uppercase tracking-wide">
                  {group.label}
                  <span className="ml-2 font-medium normal-case text-muted">
                    {summary.byCompany[group.id]?.active ?? 0} active
                  </span>
                </h2>
                {rows.map((vehicle) => (
                  <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    overview={overview}
                    manage={manage}
                    saving={savingId === vehicle.id}
                    userId={user.id}
                    userName={user.name}
                    onArchive={() => setPendingArchive(vehicle)}
                    onPowertrain={(powertrain) => void setPowertrain(vehicle, powertrain)}
                    onUpdated={(updated) =>
                      setVehicles((prev) =>
                        prev.map((item) => (item.id === updated.id ? updated : item))
                      )
                    }
                  />
                ))}
              </section>
            );
          })
        )}
      </div>
      <ConfirmDialog
        open={pendingArchive !== null}
        title={
          pendingArchive
            ? `${isVehicleArchived(pendingArchive) ? "Unarchive" : "Archive"} ${formatUnitLabel(pendingArchive.unitNumber, pendingArchive.plate)}?`
            : "Update this unit?"
        }
        body={
          pendingArchive && isVehicleArchived(pendingArchive)
            ? "It will show up in Checkout again."
            : "It will be hidden from Checkout. Past reports stay in Office."
        }
        confirmLabel={
          pendingArchive && isVehicleArchived(pendingArchive) ? "Unarchive" : "Archive"
        }
        busy={pendingArchive != null && savingId === pendingArchive.id}
        onConfirm={() => {
          if (!pendingArchive) return;
          const vehicle = pendingArchive;
          setPendingArchive(null);
          void toggleArchive(vehicle);
        }}
        onCancel={() => {
          if (!savingId) setPendingArchive(null);
        }}
      />
    </div>
  );
}

function VehicleCard({
  vehicle,
  overview,
  manage,
  saving,
  userId,
  userName,
  onArchive,
  onPowertrain,
  onUpdated,
}: {
  vehicle: SharedVehicle;
  overview: boolean;
  manage: boolean;
  saving: boolean;
  userId: string;
  userName: string;
  onArchive: () => void;
  onPowertrain: (powertrain: "gas" | "ev") => void;
  onUpdated: (vehicle: SharedVehicle) => void;
}) {
  const archived = isVehicleArchived(vehicle);
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{formatUnitLabel(vehicle.unitNumber, vehicle.plate)}</CardTitle>
            <p className="text-sm text-gray-600">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.powertrain === "ev" ? " · EV" : ""}
            </p>
            {vehicle.lastMileage != null && (
              <p className="text-sm text-muted mt-1">
                Mileage: {formatMileage(vehicle.lastMileage)}
              </p>
            )}
            {archived && vehicle.archivedAt && (
              <p className="text-xs text-muted mt-1">
                Out of service since {formatDate(vehicle.archivedAt)}
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              archived ? "bg-gray-200 text-gray-700" : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {archived ? "Archived" : "Active"}
          </span>
        </div>
        {!archived && (
          <Link href="/checkout">
            <Button size="sm" className="w-full">
              Start a check
            </Button>
          </Link>
        )}
        {overview && (
          <Link href={`/office?unitId=${vehicle.id}`}>
            <Button size="sm" variant="outline" className="w-full">
              Office reports
            </Button>
          </Link>
        )}
        {manage && (
          <>
            <OfficeUnitService
              vehicle={vehicle}
              userId={userId}
              userName={userName}
              onUpdated={onUpdated}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => onPowertrain("gas")}
                className={`min-h-[40px] rounded-xl border text-sm font-semibold ${
                  vehicle.powertrain !== "ev"
                    ? "border-amber-600 bg-amber-50 text-amber-900"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                Gas
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onPowertrain("ev")}
                className={`min-h-[40px] rounded-xl border text-sm font-semibold ${
                  vehicle.powertrain === "ev"
                    ? "border-sky-600 bg-sky-50 text-sky-800"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                EV
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              variant={archived ? "primary" : "outline"}
              className="w-full"
              disabled={saving}
              onClick={onArchive}
            >
              {archived ? (
                <ArchiveRestore className="h-4 w-4 mr-1.5" />
              ) : (
                <Archive className="h-4 w-4 mr-1.5" />
              )}
              {saving ? "Saving…" : archived ? "Unarchive" : "Archive"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
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
      className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
        active ? "bg-accent text-[#052e16]" : "bg-surface text-muted border border-line"
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
