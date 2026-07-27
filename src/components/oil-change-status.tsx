"use client";

import { Vehicle } from "@/lib/types";
import {
  getOilChangeStatus,
  milesSinceOilChange,
  oilChangeStatusLabel,
  OIL_CHANGE_INTERVAL_MI,
} from "@/lib/oil-change";
import { formatMileage } from "@/lib/utils";
import { Droplets } from "lucide-react";

interface OilChangeStatusProps {
  vehicle: Vehicle;
  /** Current or estimated odometer for status */
  currentMileage: number;
  compact?: boolean;
}

export function OilChangeStatusBadge({
  vehicle,
  currentMileage,
  compact,
}: OilChangeStatusProps) {
  const status = getOilChangeStatus(vehicle, currentMileage);
  const since = milesSinceOilChange(vehicle, currentMileage);

  const colors =
    status === "overdue"
      ? "bg-red-100 text-red-800 border-red-200"
      : status === "due_soon"
        ? "bg-amber-100 text-amber-900 border-amber-200"
        : status === "unknown"
          ? "bg-gray-100 text-gray-600 border-gray-200"
          : "bg-green-100 text-green-800 border-green-200";

  return (
    <div className={`rounded-lg border px-3 py-2 ${colors}`}>
      <div className="flex items-start gap-2">
        <Droplets className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide">Oil change</p>
          <p className="text-sm font-medium">{oilChangeStatusLabel(status)}</p>
          {!compact && vehicle.lastOilChangeMileage != null && (
            <p className="text-xs mt-1 opacity-90">
              Last at {formatMileage(vehicle.lastOilChangeMileage)}
              {since != null && (
                <> · {formatMileage(since)} since (limit {OIL_CHANGE_INTERVAL_MI.toLocaleString()} mi)</>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
