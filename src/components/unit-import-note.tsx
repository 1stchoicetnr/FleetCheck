"use client";

import { useEffect, useState } from "react";
import { runFleetSync, type FleetSyncReport } from "@/lib/run-fleet-sync";

export function UnitImportNote() {
  const [report, setReport] = useState<FleetSyncReport | null>(null);

  useEffect(() => {
    runFleetSync()
      .then(setReport)
      .catch(() => setReport(null));
  }, []);

  if (!report || report.uploaded.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-gray-700 space-y-2">
      <p className="font-semibold text-gray-900">Vehicles saved on the server.</p>
      <p>{report.uploaded.join(", ")}</p>
    </div>
  );
}
