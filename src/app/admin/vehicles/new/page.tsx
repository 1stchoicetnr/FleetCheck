"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { canManageFleet } from "@/lib/fleet-config";
import { getCompanies, getFleets, saveVehicle } from "@/lib/storage";
import { upsertSharedVehicle } from "@/lib/checkout-api";
import { inferPowertrain, Powertrain } from "@/lib/inspection-form";
import { Company, Fleet, Vehicle, fleetTypeLabel } from "@/lib/types";
import { defaultCompanyId } from "@/lib/companies";
import { cn } from "@/lib/utils";

type FieldKey = "companyId" | "plate" | "make" | "model" | "year" | "fleetId";

export default function NewVehiclePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState({
    plate: "",
    make: "",
    model: "",
    year: new Date().getFullYear().toString(),
    fleetId: "",
    companyId: "",
    unitNumber: "",
    vin: "",
    powertrain: "" as Powertrain | "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canManageFleet(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    Promise.all([getFleets(), getCompanies()]).then(([f, c]) => {
      setFleets(f);
      setCompanies(c);
      setForm((prev) => ({
        ...prev,
        fleetId: prev.fleetId || f[0]?.id || "",
        companyId: prev.companyId || defaultCompanyId(c),
      }));
    });
  }, []);

  const missing = (): FieldKey[] => {
    const keys: FieldKey[] = [];
    if (!form.companyId) keys.push("companyId");
    if (!form.plate.trim()) keys.push("plate");
    if (!form.make.trim()) keys.push("make");
    if (!form.model.trim()) keys.push("model");
    if (!form.year.trim() || Number.isNaN(Number(form.year))) keys.push("year");
    return keys;
  };

  const fieldError = (key: FieldKey) => showErrors && missing().includes(key);

  const handleSubmit = async () => {
    const empty = missing();
    if (empty.length) {
      setShowErrors(true);
      setError("Fill the highlighted fields.");
      return;
    }
    setSaving(true);
    setError("");

    const powertrain = inferPowertrain(
      form.make,
      form.model,
      form.powertrain || undefined
    );

    try {
      const shared = await upsertSharedVehicle({
        companyId: form.companyId,
        unitNumber: form.unitNumber.trim() || form.plate.trim(),
        plate: form.plate.trim(),
        make: form.make.trim(),
        model: form.model.trim(),
        year: Number(form.year),
        powertrain,
      });

      const vehicle: Vehicle = {
        id: shared.id,
        fleetId: form.fleetId || fleets[0]?.id || "fleet-taxi",
        companyId: shared.companyId,
        unitNumber: shared.unitNumber,
        plate: shared.plate,
        make: shared.make,
        model: shared.model,
        year: shared.year,
        vin: form.vin || undefined,
        status: "ready",
        qrCode: `FC-${shared.plate.replace(/[\s-]/g, "").toUpperCase()}`,
        createdAt: shared.createdAt,
      };
      await saveVehicle(vehicle);
      router.push("/admin");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save this unit to the shared checkout list."
      );
      setSaving(false);
    }
  };

  if (loading || !user) return null;

  const inferred = inferPowertrain(
    form.make,
    form.model,
    form.powertrain || undefined
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Add Vehicle" backHref="/admin" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <p className="text-sm text-gray-600">
          Super Admin add writes to the same shared unit list Checkout uses.
          After save, the van appears under active Unit # on Checkout.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Company
          </label>
          <select
            value={form.companyId}
            onChange={(e) => setForm({ ...form, companyId: e.target.value })}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-base min-h-[48px] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none",
              fieldError("companyId")
                ? "border-red-500 bg-red-50"
                : "border-gray-300"
            )}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Unit #"
          placeholder="12"
          value={form.unitNumber}
          onChange={(e) => setForm({ ...form, unitNumber: e.target.value })}
          hint="Fleet unit number. Plate is used if you leave this blank."
        />
        <Input
          label="License Plate"
          placeholder="ABC-1234"
          value={form.plate}
          error={fieldError("plate") ? "Required" : undefined}
          onChange={(e) => setForm({ ...form, plate: e.target.value })}
        />
        <Input
          label="Make"
          placeholder="Toyota"
          value={form.make}
          error={fieldError("make") ? "Required" : undefined}
          onChange={(e) => setForm({ ...form, make: e.target.value })}
        />
        <Input
          label="Model"
          placeholder="Camry"
          value={form.model}
          error={fieldError("model") ? "Required" : undefined}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
        <Input
          label="Year"
          type="number"
          value={form.year}
          error={fieldError("year") ? "Required" : undefined}
          onChange={(e) => setForm({ ...form, year: e.target.value })}
        />
        <Input
          label="VIN (optional)"
          placeholder="1HGBH41JXMN109186"
          value={form.vin}
          onChange={(e) => setForm({ ...form, vin: e.target.value })}
        />

        <div>
          <p className="block text-sm font-medium text-gray-700 mb-1.5">
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
                onClick={() => setForm({ ...form, powertrain: value })}
                className={cn(
                  "min-h-[48px] rounded-xl border-2 font-semibold",
                  inferred === value
                    ? "border-brand-600 bg-brand-50 text-brand-800"
                    : "border-gray-200 bg-white text-gray-700"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            EV units skip Oil and Fuel on Precheck.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Fleet (local overview)
          </label>
          <select
            value={form.fleetId}
            onChange={(e) => setForm({ ...form, fleetId: e.target.value })}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base min-h-[48px] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          >
            {fleets.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({fleetTypeLabel(f.type)})
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-sm font-medium text-red-600">{error}</p>
        )}

        <Button
          size="xl"
          className="w-full mt-4"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? "Saving..." : "Add Vehicle"}
        </Button>
      </div>
    </div>
  );
}
