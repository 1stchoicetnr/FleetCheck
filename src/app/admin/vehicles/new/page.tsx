"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { canManageFleet } from "@/lib/fleet-config";
import { getCompanies, getFleets, saveVehicle } from "@/lib/storage";
import { Company, Fleet, Vehicle, fleetTypeLabel } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { defaultCompanyId } from "@/lib/companies";

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
  });
  const [saving, setSaving] = useState(false);

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

  const handleSubmit = async () => {
    if (!form.plate || !form.make || !form.model || !form.fleetId || !form.companyId) return;
    setSaving(true);

    const vehicle: Vehicle = {
      id: generateId(),
      fleetId: form.fleetId,
      companyId: form.companyId,
      unitNumber: form.unitNumber.trim() || form.plate.toUpperCase(),
      plate: form.plate.toUpperCase(),
      make: form.make,
      model: form.model,
      year: Number(form.year),
      vin: form.vin || undefined,
      status: "ready",
      qrCode: `FC-${form.plate.replace(/[\s-]/g, "").toUpperCase()}`,
      createdAt: new Date().toISOString(),
    };

    await saveVehicle(vehicle);
    router.push("/vehicles");
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Add Vehicle" backHref="/admin" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Company
          </label>
          <select
            value={form.companyId}
            onChange={(e) => setForm({ ...form, companyId: e.target.value })}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base min-h-[48px] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
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
          onChange={(e) => setForm({ ...form, plate: e.target.value })}
        />
        <Input
          label="Make"
          placeholder="Toyota"
          value={form.make}
          onChange={(e) => setForm({ ...form, make: e.target.value })}
        />
        <Input
          label="Model"
          placeholder="Camry"
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
        <Input
          label="Year"
          type="number"
          value={form.year}
          onChange={(e) => setForm({ ...form, year: e.target.value })}
        />
        <Input
          label="VIN (optional)"
          placeholder="1HGBH41JXMN109186"
          value={form.vin}
          onChange={(e) => setForm({ ...form, vin: e.target.value })}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Fleet
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

        <Button
          size="xl"
          className="w-full mt-4"
          onClick={handleSubmit}
          disabled={saving || !form.plate || !form.make || !form.model}
        >
          {saving ? "Saving..." : "Add Vehicle"}
        </Button>
      </div>
    </div>
  );
}
