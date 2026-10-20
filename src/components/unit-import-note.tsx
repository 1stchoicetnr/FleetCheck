"use client";

import { useEffect, useState } from "react";
import { runLocalUnitImport, UnitImportReport } from "@/lib/run-local-unit-import";

export function UnitImportNote() {
  const [report, setReport] = useState<UnitImportReport | null>(null);

  useEffect(() => {
    runLocalUnitImport()
      .then(setReport)
      .catch(() => setReport(null));
  }, []);

  if (!report || (report.imported.length === 0 && report.skipped.length === 0)) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-gray-700 space-y-2">
      <p className="font-semibold text-gray-900">On-device vehicles checked against the shared list.</p>
      <p>
        Imported: {report.imported.length ? report.imported.join(", ") : "none"}
      </p>
      {report.skipped.length > 0 && (
        <ul className="list-disc pl-5 space-y-1">
          {report.skipped.map((item) => (
            <li key={item.detail}>{item.detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
