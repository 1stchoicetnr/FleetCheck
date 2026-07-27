"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getVehicles } from "@/lib/storage";
import { STATUS_LABELS, VehicleStatus } from "@/lib/types";
const STATUSES: VehicleStatus[] = [
  "ready",
  "checked_out",
  "needs_work",
  "out_of_service",
];

const COLORS: Record<VehicleStatus, string> = {
  ready: "bg-green-100 text-green-800 border-green-200",
  checked_out: "bg-blue-100 text-blue-800 border-blue-200",
  needs_work: "bg-amber-100 text-amber-900 border-amber-200",
  out_of_service: "bg-red-100 text-red-800 border-red-200",
};

export function FleetStatusStats() {
  const [counts, setCounts] = useState<Record<VehicleStatus, number>>({
    ready: 0,
    checked_out: 0,
    needs_work: 0,
    out_of_service: 0,
  });

  useEffect(() => {
    getVehicles().then((vehicles) => {
      const next = { ready: 0, checked_out: 0, needs_work: 0, out_of_service: 0 };
      for (const v of vehicles) {
        next[v.status]++;
      }
      setCounts(next);
    });
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3">
      {STATUSES.map((s) => (
        <Link
          key={s}
          href={`/vehicles?status=${s}`}
          className={`rounded-xl border p-4 text-center transition-shadow hover:shadow-md active:scale-[0.98] ${COLORS[s]}`}
        >
          <p className="text-2xl font-bold">{counts[s]}</p>
          <p className="text-xs font-semibold uppercase tracking-wide mt-1">
            {STATUS_LABELS[s]}
          </p>
        </Link>
      ))}    </div>
  );
}
