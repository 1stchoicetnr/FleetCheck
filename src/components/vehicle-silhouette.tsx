"use client";

import { DamageSide } from "@/lib/inspection-form";
import { cn } from "@/lib/utils";

const ZONES: Array<{
  id: DamageSide;
  label: string;
  d: string;
}> = [
  {
    id: "front",
    label: "Front",
    d: "M34 8 C34 4 46 2 60 2 C74 2 86 4 86 8 L90 22 L30 22 Z",
  },
  {
    id: "left",
    label: "Left",
    d: "M18 24 L36 24 L36 96 L18 96 C12 90 10 70 10 60 C10 50 12 30 18 24 Z",
  },
  {
    id: "right",
    label: "Right",
    d: "M84 24 L102 24 C108 30 110 50 110 60 C110 70 108 90 102 96 L84 96 Z",
  },
  {
    id: "rear",
    label: "Rear",
    d: "M30 98 L90 98 L86 118 C86 122 74 124 60 124 C46 124 34 122 34 118 Z",
  },
];

export function VehicleSilhouette({
  marked,
  onToggle,
}: {
  marked: DamageSide[];
  onToggle: (side: DamageSide) => void;
}) {
  const markedSet = new Set(marked);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-800">
        Mark damage on the vehicle
      </p>
      <p className="text-xs text-gray-500">
        Tap front, rear, left, or right — same intent as the paper left/right
        diagrams. Add a note for that side below.
      </p>
      <svg
        viewBox="0 0 120 128"
        className="w-full max-w-[220px] mx-auto"
        role="img"
        aria-label="Vehicle silhouette for marking damage"
      >
        <rect x="38" y="26" width="44" height="70" rx="6" fill="#f8fafc" stroke="#94a3b8" />
        <rect x="44" y="34" width="32" height="22" rx="3" fill="#e2e8f0" />
        <rect x="44" y="68" width="32" height="20" rx="3" fill="#e2e8f0" />
        {ZONES.map((zone) => {
          const on = markedSet.has(zone.id);
          return (
            <path
              key={zone.id}
              d={zone.d}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${zone.label} damage`}
              className="cursor-pointer"
              fill={on ? "rgba(220,38,38,0.45)" : "rgba(148,163,184,0.18)"}
              stroke={on ? "#b91c1c" : "#64748b"}
              strokeWidth={on ? 2.2 : 1.4}
              onClick={() => onToggle(zone.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(zone.id);
                }
              }}
            />
          );
        })}
        <text x="60" y="16" textAnchor="middle" fontSize="8" fill="#334155">
          Front
        </text>
        <text x="60" y="112" textAnchor="middle" fontSize="8" fill="#334155">
          Rear
        </text>
        <text x="16" y="64" textAnchor="middle" fontSize="8" fill="#334155">
          L
        </text>
        <text x="104" y="64" textAnchor="middle" fontSize="8" fill="#334155">
          R
        </text>
      </svg>
      <div className="flex flex-wrap gap-2 justify-center">
        {ZONES.map((zone) => {
          const on = markedSet.has(zone.id);
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onToggle(zone.id)}
              className={cn(
                "min-h-[40px] px-3 rounded-full text-xs font-semibold border-2",
                on
                  ? "border-red-600 bg-red-50 text-red-800"
                  : "border-gray-200 bg-white text-gray-700"
              )}
            >
              {zone.label}
              {on ? " · marked" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
