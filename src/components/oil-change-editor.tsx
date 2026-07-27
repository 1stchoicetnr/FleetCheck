"use client";

import { useState } from "react";
import { Vehicle } from "@/lib/types";
import { saveVehicle } from "@/lib/storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface OilChangeEditorProps {
  vehicle: Vehicle;
  canEdit: boolean;
  onUpdated: (vehicle: Vehicle) => void;
}

export function OilChangeEditor({
  vehicle,
  canEdit,
  onUpdated,
}: OilChangeEditorProps) {
  const [value, setValue] = useState(
    vehicle.lastOilChangeMileage?.toString() ?? ""
  );
  const [saving, setSaving] = useState(false);

  if (!canEdit && vehicle.lastOilChangeMileage == null) return null;

  const save = async () => {
    const n = Number(value);
    if (!value.trim() || isNaN(n)) return;
    setSaving(true);
    try {
      const updated = { ...vehicle, lastOilChangeMileage: n };
      await saveVehicle(updated);
      onUpdated(updated);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <p className="text-xs text-gray-500">
        Last oil change mileage: {vehicle.lastOilChangeMileage!.toLocaleString()} mi
      </p>
    );
  }

  return (
    <div className="flex gap-2 items-end">
      <Input
        label="Last oil change mileage"
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. 40000"
        className="flex-1"
      />
      <Button size="sm" onClick={save} disabled={saving}>
        Save
      </Button>
    </div>
  );
}
