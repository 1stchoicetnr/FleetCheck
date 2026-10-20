"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCompanies, fetchVehicles } from "@/lib/checkout-api";
import { Company } from "@/lib/types";
import { summarizeUnits, unitCountLine, UnitCounts } from "@/lib/unit-counts";

export function FleetStatusStats() {
  const [summary, setSummary] = useState<UnitCounts | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetchVehicles(undefined, { includeArchived: true }),
      fetchCompanies(),
    ])
      .then(([vehicles, companyList]) => {
        setSummary(summarizeUnits(vehicles));
        setCompanies(companyList);
        setError("");
      })
      .catch((err: Error) => {
        setError(err.message || "Could not load the shared unit list.");
      });
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p>Unlock Office to load the shared unit count.</p>
        <Link href="/office?next=/dashboard" className="font-semibold underline">
          Enter office PIN
        </Link>
      </div>
    );
  }

  if (!summary) {
    return <p className="text-sm text-gray-500">Loading units…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">{unitCountLine(summary)}</p>
      <div className="grid grid-cols-2 gap-3">
        {companies.map((company) => {
          const bucket = summary.byCompany[company.id] ?? { active: 0, archived: 0 };
          return (
            <Link
              key={company.id}
              href="/office/units"
              className="rounded-xl border border-slate-200 bg-white p-4 text-center transition-shadow hover:shadow-md active:scale-[0.98]"
            >
              <p className="text-2xl font-bold text-gray-900">{bucket.active}</p>
              <p className="text-xs font-semibold uppercase tracking-wide mt-1 text-gray-600">
                {company.name}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                {bucket.archived} archived
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
