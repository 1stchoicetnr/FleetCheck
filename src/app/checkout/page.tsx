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
  fetchFleetSettings,
  fetchVehicles,
  SharedVehicle,
  upsertSharedVehicle,
} from "@/lib/checkout-api";
import { Company, CheckoutType } from "@/lib/types";
import { defaultCompanyId } from "@/lib/companies";
import {
  applyPowertrainToForm,
  CLOVER_SERIAL_HINT,
  CLOVER_SERIAL_LABEL,
  createEmptyInspectionForm,
  inferPowertrain,
  Powertrain,
  UNIT_NUMBER_LABEL,
} from "@/lib/inspection-form";
import {
  getLastDispatcherName,
  getLastVehicleId,
  saveLastDispatcherName,
  saveLastVehicleId,
} from "@/lib/checkout-prefs";
import { formatDateOnly, formatUnitLabel, normalizePlate } from "@/lib/utils";
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
  const [cloverSerial, setCloverSerial] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [powertrainOverride, setPowertrainOverride] = useState<Powertrain | "">("");
  const [allowDriverAdd, setAllowDriverAdd] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const inspectionDate = formatDateOnly(new Date().toISOString());

  useEffect(() => {
    const saved = getLastDispatcherName();
    if (saved) setDispatcherName(saved);
  }, []);

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
    fetchFleetSettings()
      .then((settings) => setAllowDriverAdd(settings.allowDriverAddVehicles))
      .catch(() => setAllowDriverAdd(false));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    fetchVehicles(companyId)
      .then((list) => {
        const sorted = [...list].sort((a, b) =>
          a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
        );
        setVehicles(sorted);
        setVehicleId((prev) => {
          if (sorted.some((v) => v.id === prev)) return prev;
          const last = getLastVehicleId(companyId);
          if (last && sorted.some((v) => v.id === last)) return last;
          return sorted[0]?.id ?? "";
        });
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

  const inferredPowertrain = inferPowertrain(
    make,
    model,
    powertrainOverride || selected?.powertrain
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
    setPowertrainOverride(selected.powertrain || "");
    if (selected.lastMileage != null) {
      setOdometer(String(selected.lastMileage));
    }
  }, [selected, addingUnit]);

  const handleStart = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const fieldErrors: string[] = [];
    if (!odometer.trim() || isNaN(Number(odometer))) fieldErrors.push("odometer");
    if (!driverName.trim()) fieldErrors.push("driverName");
    if (!dispatcherName.trim()) fieldErrors.push("dispatcherName");
    if (!year.trim() || !make.trim() || !model.trim()) {
      fieldErrors.push("year", "make", "model");
    }
    if (addingUnit && allowDriverAdd && !newPlate.trim()) fieldErrors.push("newPlate");
    if (!addingUnit && !vehicleId) fieldErrors.push("vehicleId");
    if (fieldErrors.length) {
      setShowErrors(true);
      setError("Fill the highlighted fields.");
      return;
    }

    setStarting(true);
    setError("");
    try {
      let vehicle = selected;
      if (addingUnit && allowDriverAdd) {
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
          powertrain: inferredPowertrain,
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
      if (vehicle.powertrain !== inferredPowertrain) {
        vehicle = await upsertSharedVehicle({
          companyId,
          unitNumber: vehicle.unitNumber,
          plate: vehicle.plate,
          make: make.trim() || vehicle.make,
          model: model.trim() || vehicle.model,
          year: Number(year) || vehicle.year,
          powertrain: inferredPowertrain,
        });
        setVehicles((prev) =>
          prev.map((item) => (item.id === vehicle!.id ? vehicle! : item))
        );
      }

      const id = checkoutDraftId(companyId, vehicle.id, type, user.id);
      const existing = await getCheckoutDraft(id);
      const powertrain = inferPowertrain(
        make.trim(),
        model.trim(),
        vehicle.powertrain || inferredPowertrain
      );
      const inspectionForm = applyPowertrainToForm(
        {
          ...(existing?.inspectionForm ??
            createEmptyInspectionForm(powertrain, {
              inspectedAt: new Date().toISOString(),
            })),
          ...(cloverSerial.trim()
            ? { cloverSerial: cloverSerial.trim() }
            : {}),
        },
        powertrain
      );
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
        photoFlags: existing?.photoFlags,
        inspectionForm,
        signatureDataUrl: existing?.signatureDataUrl,
        signedAt: existing?.signedAt,
        updatedAt: new Date().toISOString(),
      });
      saveLastDispatcherName(dispatcherName.trim());
      saveLastVehicleId(companyId, vehicle.id);
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
            Precheck first (about a minute), then photos if Green or Yellow.
            Red parks the van for Office.
          </p>
        </div>

        <Card>
          <CardContent className="py-5">
            <form onSubmit={handleStart} className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <p>
                  <span className="font-semibold">Date:</span> {inspectionDate}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Same header as the paper form — date, name, vehicle, optional
                  Clover serial (last digits), odometer start.
                </p>
              </div>
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
                      {UNIT_NUMBER_LABEL} (active vans)
                    </label>
                    <select
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                      className={`w-full rounded-xl border-2 px-4 py-4 text-lg min-h-[56px] bg-white ${
                        showErrors && !vehicleId
                          ? "border-red-500 bg-red-50"
                          : "border-gray-300"
                      }`}
                    >
                      {filteredVehicles.length === 0 && (
                        <option value="">
                          {allowDriverAdd
                            ? "No units match — add the plate below"
                            : "No units match. Ask Super Admin to add this van."}
                        </option>
                      )}
                      {filteredVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {formatUnitLabel(v.unitNumber, v.plate)} — {v.year}{" "}
                          {v.make} {v.model}
                        </option>
                      ))}
                    </select>
                    {showErrors && !vehicleId && (
                      <p className="text-sm font-medium text-red-600 mt-1.5">
                        Pick an active unit.
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-1.5">
                      Only active units. Archived / out-of-service vans are
                      hidden until Office unarchives them.
                    </p>
                  </div>
                </>
              )}

              {allowDriverAdd && (
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
              )}

              {allowDriverAdd && addingUnit && (
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
                    error={
                      showErrors && !newPlate.trim()
                        ? "Enter the license plate for this unit."
                        : undefined
                    }
                  />
                  <Input
                    label={`${UNIT_NUMBER_LABEL} (optional)`}
                    value={newUnitNumber}
                    onChange={(e) => setNewUnitNumber(e.target.value)}
                    hint="Vehicle number for this van. Leave blank to use the plate."
                  />
                  <div>
                    <p className="block text-base font-semibold text-gray-900 mb-1.5">
                      Powertrain
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["gas", "Gas"],
                          ["ev", "EV"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPowertrainOverride(value)}
                          className={`min-h-[48px] rounded-xl border-2 font-semibold ${
                            inferredPowertrain === value
                              ? "border-brand-600 bg-brand-50 text-brand-800"
                              : "border-gray-200 bg-white text-gray-700"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                      Tesla and other EVs skip Oil and Fuel level.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Input
                  label="Year"
                  inputMode="numeric"
                  value={year}
                  error={showErrors && !year.trim() ? "Required" : undefined}
                  onChange={(e) => setYear(e.target.value)}
                />
                <Input
                  label="Make"
                  value={make}
                  error={showErrors && !make.trim() ? "Required" : undefined}
                  onChange={(e) => setMake(e.target.value)}
                />
                <Input
                  label="Model"
                  value={model}
                  error={showErrors && !model.trim() ? "Required" : undefined}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>

              <Input
                label="Odometer start"
                type="number"
                inputMode="numeric"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                error={
                  showErrors && (!odometer.trim() || isNaN(Number(odometer)))
                    ? "Enter the odometer reading."
                    : undefined
                }
                hint="Mileage on the dash — must be readable in the odometer photo"
              />
              <Input
                label={`${CLOVER_SERIAL_LABEL} (optional)`}
                value={cloverSerial}
                onChange={(e) => setCloverSerial(e.target.value)}
                inputMode="numeric"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={8}
                placeholder="e.g. 4821"
                hint={CLOVER_SERIAL_HINT}
              />
              <Input
                label="Name (driver)"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                error={
                  showErrors && !driverName.trim()
                    ? "Enter the driver name."
                    : undefined
                }
              />
              {!addingUnit && (
                <div>
                  <p className="block text-base font-semibold text-gray-900 mb-1.5">
                    Powertrain
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["gas", "Gas"],
                        ["ev", "EV"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPowertrainOverride(value)}
                        className={`min-h-[48px] rounded-xl border-2 font-semibold ${
                          inferredPowertrain === value
                            ? "border-brand-600 bg-brand-50 text-brand-800"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-gray-200 px-4 py-3 text-sm">
                <p className="font-semibold text-gray-900">
                  {inferredPowertrain === "ev" ? "EV unit" : "Gas unit"}
                </p>
                <p className="text-gray-600 mt-0.5">
                  {inferredPowertrain === "ev"
                    ? "Oil and Fuel level will be N/A on Precheck."
                    : "Oil and Fuel level are required on Precheck."}
                </p>
              </div>
              <Input
                label="Dispatcher"
                value={dispatcherName}
                onChange={(e) => setDispatcherName(e.target.value)}
                placeholder="Who is taking this vehicle in?"
                error={
                  showErrors && !dispatcherName.trim()
                    ? "Enter the dispatcher name."
                    : undefined
                }
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
                {starting ? "Starting…" : "Continue to Precheck"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
