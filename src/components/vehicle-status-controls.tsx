"use client";

import { VehicleStatus, STATUS_LABELS } from "@/lib/types";
import { MANUAL_VEHICLE_STATUSES } from "@/lib/vehicle-status";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface VehicleStatusControlsProps {
  current: VehicleStatus;
  onChange: (status: VehicleStatus) => void;
  disabled?: boolean;
}

const BUTTON_STYLES = {
  ready: {
    active: "border-green-600 bg-green-50 text-green-900 ring-2 ring-green-600/20",
    idle: "border-green-200 bg-white text-green-800 hover:bg-green-50",
  },
  needs_work: {
    active: "border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-500/20",
    idle: "border-amber-200 bg-white text-amber-900 hover:bg-amber-50",
  },
  out_of_service: {
    active: "border-red-600 bg-red-50 text-red-900 ring-2 ring-red-600/20",
    idle: "border-red-200 bg-white text-red-800 hover:bg-red-50",
  },
};

export function VehicleStatusControls({
  current,
  onChange,
  disabled,
}: VehicleStatusControlsProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 space-y-2">
      <p className="text-sm font-semibold text-gray-900">Set status</p>
      <div className="grid grid-cols-3 gap-2">
        {MANUAL_VEHICLE_STATUSES.map((status) => {
          const selected = current === status;
          const styles = BUTTON_STYLES[status];
          return (
            <button
              key={status}
              type="button"
              disabled={disabled}
              onClick={() => onChange(status)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-center text-xs font-bold leading-tight transition-colors min-h-[64px]",
                selected ? styles.active : styles.idle,
                disabled && "opacity-60 cursor-not-allowed"
              )}
            >
              {selected && <Check className="h-4 w-4 flex-shrink-0" aria-hidden />}
              <span>{STATUS_LABELS[status]}</span>
            </button>
          );
        })}
      </div>
      {current === "checked_out" && (
        <p className="text-xs text-gray-500">
          Checked out is set automatically when a driver checks out. Choose a status
          above when the vehicle is back in the yard.
        </p>
      )}
    </div>
  );
}


