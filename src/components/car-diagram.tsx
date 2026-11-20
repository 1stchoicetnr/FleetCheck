"use client";

import type { DamageSpot } from "@/lib/damage-closeup";

/**
 * Simple top-down car. Front of the car at the top. Tap to mark where the
 * damage is; the spot is stored 0..1 across and 0..1 from the front.
 */
export function CarDiagram({
  spot,
  onSpot,
  size = 180,
  dark = false,
}: {
  spot?: DamageSpot;
  onSpot?: (spot: DamageSpot) => void;
  size?: number;
  dark?: boolean;
}) {
  const w = size * 0.6;
  const h = size;
  const stroke = dark ? "#d4d4d8" : "#374151";
  const fill = dark ? "#1c1c1e" : "#f9fafb";
  return (
    <svg
      viewBox="0 0 60 100"
      width={w}
      height={h}
      role={onSpot ? "button" : "img"}
      aria-label={onSpot ? "Tap where the damage is" : "Damage location"}
      className={onSpot ? "cursor-crosshair touch-none select-none" : undefined}
      onClick={(e) => {
        if (!onSpot) return;
        const box = e.currentTarget.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
        const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
        onSpot({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
      }}
    >
      <text x="30" y="5" textAnchor="middle" fontSize="4" fill={stroke}>FRONT</text>
      <rect x="10" y="8" width="40" height="84" rx="12" fill={fill} stroke={stroke} strokeWidth="1.5" />
      <rect x="15" y="22" width="30" height="12" rx="3" fill="none" stroke={stroke} strokeWidth="1" />
      <rect x="15" y="68" width="30" height="10" rx="3" fill="none" stroke={stroke} strokeWidth="1" />
      <line x1="10" y1="50" x2="50" y2="50" stroke={stroke} strokeWidth="0.5" strokeDasharray="2 2" />
      <rect x="6" y="20" width="4" height="12" rx="1.5" fill={stroke} />
      <rect x="50" y="20" width="4" height="12" rx="1.5" fill={stroke} />
      <rect x="6" y="68" width="4" height="12" rx="1.5" fill={stroke} />
      <rect x="50" y="68" width="4" height="12" rx="1.5" fill={stroke} />
      <text x="3" y="52" fontSize="3.5" fill={stroke}>L</text>
      <text x="55" y="52" fontSize="3.5" fill={stroke}>R</text>
      <text x="30" y="98" textAnchor="middle" fontSize="4" fill={stroke}>REAR</text>
      {spot && (
        <g>
          <circle cx={spot.x * 60} cy={spot.y * 100} r="5" fill="#dc2626" fillOpacity="0.35" />
          <circle cx={spot.x * 60} cy={spot.y * 100} r="2.2" fill="#dc2626" stroke="#fff" strokeWidth="0.8" />
        </g>
      )}
    </svg>
  );
}
