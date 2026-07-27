"use client";

import { FuelLevel, FUEL_LEVEL_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FuelLevelPickerProps {
  value: FuelLevel | "";
  onChange: (level: FuelLevel) => void;
  required?: boolean;
}

const LEVELS: FuelLevel[] = [
  "full",
  "three_quarter",
  "half",
  "quarter",
  "empty",
];

export function FuelLevelPicker({
  value,
  onChange,
  required,
}: FuelLevelPickerProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">
        Current fuel level{required ? " *" : ""}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={cn(
              "py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-colors",
              value === level
                ? "border-brand-600 bg-brand-50 text-brand-800"
                : "border-gray-200 bg-white text-gray-700"
            )}
          >
            {FUEL_LEVEL_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
}
