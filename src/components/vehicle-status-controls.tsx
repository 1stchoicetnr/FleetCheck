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

const BUTTON_STYLES: Record<(typeof MANUAL_VEHICLE_STATUSES)[number], { active: string; idle: string }> = {
  ready: {
    active:
      "border-[#166534] bg-[#22c55e] text-[#052e16] disabled:bg-[#22c55e] disabled:text-[#052e16] disabled:opacity-100",
    idle:
      "border-[#22c55e] bg-[#1c1c1e] text-[#4ade80] hover:bg-[#052e16] disabled:bg-[#1c1c1e] disabled:text-[#4ade80] disabled:opacity-100",
  },
  needs_work: {
    active:
      "border-[#b45309] bg-[#f59e0b] text-[#1c1917] disabled:bg-[#f59e0b] disabled:text-[#1c1917] disabled:opacity-100",
    idle:
      "border-[#fbbf24] bg-[#1c1c1e] text-[#fbbf24] hover:bg-[#451a03] hover:text-[#fde68a] disabled:bg-[#1c1c1e] disabled:text-[#fbbf24] disabled:opacity-100",
  },
  out_of_service: {
    active:
      "border-[#991b1b] bg-[#b91c1c] text-white disabled:bg-[#b91c1c] disabled:text-white disabled:opacity-100",
    idle:
      "border-[#fca5a5] bg-[#1c1c1e] text-[#fca5a5] hover:bg-[#7f1d1d] hover:text-[#fee2e2] disabled:bg-[#1c1c1e] disabled:text-[#fca5a5] disabled:opacity-100",
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
                disabled && "cursor-not-allowed"
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


