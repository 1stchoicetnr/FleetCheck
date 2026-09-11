"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { canStartCheckout } from "@/lib/fleet-config";
import { checkoutDraftId, getCheckoutDraft, saveCheckoutDraft } from "@/lib/storage";
import {
  fetchCompanies,
  fetchVehicles,
  SharedVehicle,
  upsertSharedVehicle,
} from "@/lib/checkout-api";
import { Company, CheckoutType } from "@/lib/types";
import { defaultCompanyId } from "@/lib/companies";
import { formatUnitLabel, normalizePlate } from "@/lib/utils";
import { ClipboardCheck } from "lucide-react";

export default function CheckoutStartPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [vehicles, setVehicles] = useState<SharedVehicle[]>([]);
  const [loadError, setLoadError] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [unitQuery, setUnitQuery] = useState("");
  const [addingUnit, setAddingUnit] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newUnitNumber, setNewUnitNumber] = useState("");
  const [type, setType] = useState<CheckoutType>("check_out");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [odometer, setOdometer] = useState("");
  const [driverName, setDriverName] = useState("");
  const [dispatcherName, setDispatcherName] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canStartCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) setDriverName(user.name);
  }, [user]);

  useEffect(() => {
    fetchCompanies()
      .then((list) => {
        setCompanies(list);
        setCompanyId((prev) => prev || defaultCompanyId(list));
        setLoadError("");
      })
      .catch((err: Error) => {
        setLoadError(err.message || "Could not load companies from the shared server.");
      });
  }, []);

  useEffect(() => {
    if (!companyId) return;
    fetchVehicles(companyId)
      .then((list) => {
        const sorted = [...list].sort((a, b) =>
          a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
        );
        setVehicles(sorted);
        setVehicleId((prev) =>
          sorted.some((v) => v.id === prev) ? prev : sorted[0]?.id ?? ""
        );
      })
      .catch((err: Error) => {
        setLoadError(err.message || "Could not load units from the shared server.");
      });
  }, [companyId]);

  const filteredVehicles = useMemo(() => {
    const q = unitQuery.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const hay = `${v.unitNumber} ${v.plate} ${v.year} ${v.make} ${v.model}`.toLowerCase();
      return hay.includes(q) || normalizePlate(v.plate).includes(normalizePlate(q));
    });
  }, [vehicles, unitQuery]);

  const selected = useMemo(
    () => vehicles.find((v) => v.id === vehicleId),
    [vehicles, vehicleId]
  );

  useEffect(() => {
    if (addingUnit) return;
    if (filteredVehicles.some((v) => v.id === vehicleId)) return;
    setVehicleId(filteredVehicles[0]?.id ?? "");
  }, [addingUnit, filteredVehicles, vehicleId]);

  useEffect(() => {
    if (addingUnit || !selected) return;
    setYear(String(selected.year));
    setMake(selected.make);
    setModel(selected.model);
    if (selected.lastMileage != null) {
      setOdometer(String(selected.lastMileage));
    }
  }, [selected, addingUnit]);

  const handleStart = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!odometer.trim() || isNaN(Number(odometer))) {
      setError("Enter the odometer reading.");
      return;
    }
    if (!driverName.trim()) {
      setError("Enter the driver name.");
      return;
    }
    if (!dispatcherName.trim()) {
      setError("Enter the dispatcher name.");
      return;
    }
    if (!year.trim() || !make.trim() || !model.trim()) {
      setError("Year, make, and model are required.");
      return;
    }

    setStarting(true);
    setError("");
    try {
      let vehicle = selected;
      if (addingUnit) {
        if (!newPlate.trim()) {
          setError("Enter the license plate for this unit.");
          setStarting(false);
          return;
        }
        vehicle = await upsertSharedVehicle({
          companyId,
          unitNumber: newUnitNumber.trim() || newPlate.trim(),
          plate: newPlate.trim(),
          make: make.trim(),
          model: model.trim(),
          year: Number(year),
        });
        setVehicles((prev) => {
          const next = prev.some((v) => v.id === vehicle!.id)
            ? prev.map((v) => (v.id === vehicle!.id ? vehicle! : v))
            : [...prev, vehicle!];
          return next.sort((a, b) =>
            a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
          );
        });
        setVehicleId(vehicle.id);
      }
      if (!vehicle) {
        setError("Pick a unit or add this plate first.");
        setStarting(false);
        return;
      }

      const id = checkoutDraftId(companyId, vehicle.id, type, user.id);
      const existing = await getCheckoutDraft(id);
      await saveCheckoutDraft({
        id,
        companyId,
        vehicleId: vehicle.id,
        type,
        driverId: user.id,
        driverName: driverName.trim(),
        dispatcherName: dispatcherName.trim(),
        odometer: odometer.trim(),
        year: year.trim(),
        make: make.trim(),
        model: model.trim(),
        photos: existing?.photos ?? {},
        updatedAt: new Date().toISOString(),
      });
      router.push(`/checkout/${id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save this unit to the shared server."
      );
      setStarting(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Checkout Report" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="inline-flex bg-brand-100 text-brand-700 rounded-2xl p-3 mb-1">
            <ClipboardCheck className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Start a vehicle checkout
          </h2>
          <p className="text-sm text-gray-600">
            This is the only report Office can see. Fill in the handoff, then
            take the guided photo checklist.
          </p>
        </div>

        <Card>
          <CardContent className="py-5">
            <form onSubmit={handleStart} className="space-y-4">
              <div>
                <label className="block text-base font-semibold text-gray-900 mb-1.5">
                  Company
                </label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-lg min-h-[56px] bg-white"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {!addingUnit && (
                <>
                  <Input
                    label="Search unit or plate"
                    value={unitQuery}
                    onChange={(e) => setUnitQuery(e.target.value.toUpperCase())}
                    placeholder="e.g. 12 or CXB9373"
                  />
                  <div>
                    <label className="block text-base font-semibold text-gray-900 mb-1.5">
                      Unit #
                    </label>
                    <select
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                      className="w-full rounded-xl border-2 border-gray-300 px-4 py-4 text-lg min-h-[56px] bg-white"
                    >
                      {filteredVehicles.length === 0 && (
                        <option value="">No units match — add the plate below</option>
                      )}
                      {filteredVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {formatUnitLabel(v.unitNumber, v.plate)} — {v.year}{" "}
                          {v.make} {v.model}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setAddingUnit((prev) => !prev);
                  setError("");
                }}
                className="text-sm font-semibold text-brand-700 underline underline-offset-2"
              >
                {addingUnit
                  ? "Cancel — pick an existing unit"
                  : "Plate not listed? Add unit / plate"}
              </button>

              {addingUnit && (
                <div className="rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/60 p-3 space-y-3">
                  <p className="text-sm text-gray-700">
                    Adds this van to the shared list so Office can see it —
                    including plates that were never pre-seeded.
                  </p>
                  <Input
                    label="License plate"
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                    placeholder="e.g. CXB9373"
                  />
                  <Input
                    label="Unit # (optional)"
                    value={newUnitNumber}
                    onChange={(e) => setNewUnitNumber(e.target.value)}
                    hint="Leave blank to use the plate as the unit number"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Input
                  label="Year"
                  inputMode="numeric"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
                <Input
                  label="Make"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                />
                <Input
                  label="Model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>

              <Input
                label="Odometer"
                type="number"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                hint="Mileage on the dash — must be readable in the odometer photo"
              />
              <Input
                label="Driver"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
              <Input
                label="Dispatcher"
                value={dispatcherName}
                onChange={(e) => setDispatcherName(e.target.value)}
                placeholder="Who is taking this vehicle in?"
              />

              <div>
                <p className="block text-base font-semibold text-gray-900 mb-1.5">
                  Handoff type
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["check_out", "Check out"],
                      ["check_in", "Check in"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setType(value)}
                      className={`min-h-[52px] rounded-xl border-2 font-semibold ${
                        type === value
                          ? "border-brand-600 bg-brand-50 text-brand-800"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {(error || loadError) && (
                <p className="text-sm text-red-600 font-medium">
                  {error || loadError}
                </p>
              )}

              <Button
                type="submit"
                size="xl"
                className="w-full"
                disabled={starting || (!addingUnit && !vehicleId)}
              >
                {starting ? "Starting…" : "Start photo checklist"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
