"use client";

import { useState } from "react";
import {
  MaintenanceLogEntry,
  MaintenanceLogType,
  MAINTENANCE_LOG_LABELS,
  Vehicle,
} from "@/lib/types";
import { saveMaintenanceLog, saveVehicle } from "@/lib/storage";
import { generateId, formatDate, formatMileage } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface MaintenanceLogSectionProps {
  vehicle: Vehicle;
  logs: MaintenanceLogEntry[];
  canEdit: boolean;
  userId: string;
  userName: string;
  onLogsChange: (logs: MaintenanceLogEntry[]) => void;
  onVehicleUpdated: (vehicle: Vehicle) => void;
}

export function MaintenanceLogSection({
  vehicle,
  logs,
  canEdit,
  userId,
  userName,
  onLogsChange,
  onVehicleUpdated,
}: MaintenanceLogSectionProps) {
  const [type, setType] = useState<MaintenanceLogType>("oil_change");
  const [mileage, setMileage] = useState(vehicle.lastMileage?.toString() ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const addLog = async () => {
    const mi = Number(mileage);
    if (!mileage.trim() || isNaN(mi)) return;
    setSaving(true);
    try {
      const entry: MaintenanceLogEntry = {
        id: generateId(),
        vehicleId: vehicle.id,
        type,
        mileage: mi,
        notes: notes.trim() || undefined,
        performedAt: new Date().toISOString(),
        createdBy: userId,
        createdByName: userName,
      };
      await saveMaintenanceLog(entry);
      let updatedVehicle = vehicle;
      if (type === "oil_change") {
        updatedVehicle = { ...vehicle, lastOilChangeMileage: mi };
        await saveVehicle(updatedVehicle);
        onVehicleUpdated(updatedVehicle);
      }
      onLogsChange([entry, ...logs]);
      setNotes("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-gray-900">Maintenance log</h3>

      {canEdit && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">Log maintenance</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MAINTENANCE_LOG_LABELS) as MaintenanceLogType[]).map(
              (t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    type === t
                      ? "border-brand-600 bg-brand-50 text-brand-800"
                      : "border-gray-200 text-gray-600"
                  }`}
                >
                  {MAINTENANCE_LOG_LABELS[t]}
                </button>
              )
            )}
          </div>
          <Input
            label="Mileage"
            type="number"
            inputMode="numeric"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
          />
          <Input
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Short description"
          />
          <Button size="md" onClick={addLog} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Add entry"}
          </Button>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="text-sm text-gray-500">No maintenance entries yet.</p>
      ) : (
        <ul className="space-y-2">
          {logs.slice(0, 8).map((log) => (
            <li
              key={log.id}
              className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
            >
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-gray-900">
                  {MAINTENANCE_LOG_LABELS[log.type]}
                </span>
                <span className="text-xs text-gray-500 shrink-0">
                  {formatDate(log.performedAt)}
                </span>
              </div>
              <p className="text-gray-600">{formatMileage(log.mileage)}</p>
              {log.notes && (
                <p className="text-gray-500 text-xs mt-1">{log.notes}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">{log.createdByName}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
