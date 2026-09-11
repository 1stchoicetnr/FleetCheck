"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { OfficePinGate } from "@/components/office-pin-gate";
import { ReviewStatusBadge } from "@/components/review-status-badge";
import { useAuth } from "@/hooks/use-auth";
import { canReviewCheckout } from "@/lib/fleet-config";
import { isCheckoutFlagged } from "@/lib/storage";
import {
  fetchCheckoutReports,
  fetchCompanies,
  fetchVehicles,
  SharedVehicle,
} from "@/lib/checkout-api";
import {
  CheckoutReport,
  CheckoutReviewStatus,
  Company,
} from "@/lib/types";
import { formatDate, formatMileage, formatUnitLabel } from "@/lib/utils";
import { Flag, FileSearch } from "lucide-react";

const STATUS_FILTERS: Array<CheckoutReviewStatus | "all" | "flagged"> = [
  "all",
  "flagged",
  "pending",
  "pass",
  "conditional",
  "fail",
];

function filterLabel(value: (typeof STATUS_FILTERS)[number]): string {
  if (value === "all") return "All";
  if (value === "flagged") return "Flag queue";
  if (value === "pending") return "Pending";
  if (value === "pass") return "PASS";
  if (value === "conditional") return "Conditional";
  return "FAIL";
}

export default function OfficeReportsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<CheckoutReport[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vehicles, setVehicles] = useState<SharedVehicle[]>([]);
  const [loadError, setLoadError] = useState("");
  const [companyId, setCompanyId] = useState("all");
  const [unitId, setUnitId] = useState("all");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    Promise.all([
      fetchCheckoutReports(),
      fetchCompanies(),
      fetchVehicles(),
    ])
      .then(([r, c, v]) => {
        setReports(r);
        setCompanies(c);
        setVehicles(v);
        setLoadError("");
      })
      .catch((err: Error) => {
        setLoadError(err.message || "Could not load shared checkout reports.");
      });
  }, []);

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));
  const vehicleMap = Object.fromEntries(vehicles.map((v) => [v.id, v]));

  const unitsForFilter = useMemo(() => {
    const list =
      companyId === "all"
        ? vehicles
        : vehicles.filter((v) => v.companyId === companyId);
    return [...list].sort((a, b) =>
      a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
    );
  }, [vehicles, companyId]);

  const filtered = reports.filter((report) => {
    if (companyId !== "all" && report.companyId !== companyId) return false;
    if (unitId !== "all" && report.vehicleId !== unitId) return false;
    if (status === "flagged") return isCheckoutFlagged(report);
    if (status !== "all" && report.reviewStatus !== status) return false;
    return true;
  });

  const flagCount = reports.filter(isCheckoutFlagged).length;

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Office — Checkout reports" />
      <OfficePinGate>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {loadError && (
            <p className="text-sm text-red-600 font-medium">{loadError}</p>
          )}

          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Checkout reports
              </h2>
              <p className="text-sm text-gray-500">
                {filtered.length} shown · {flagCount} flagged
              </p>
            </div>
            {flagCount > 0 && (
              <button
                type="button"
                onClick={() => setStatus("flagged")}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-100 text-red-800 px-3 py-1.5 text-xs font-semibold"
              >
                <Flag className="h-3.5 w-3.5" />
                Flag queue
              </button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className="rounded-xl border border-gray-200 px-3 py-3 text-sm bg-white min-h-[48px]"
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setUnitId("all");
              }}
            >
              <option value="all">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-gray-200 px-3 py-3 text-sm bg-white min-h-[48px]"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="all">All units</option>
              {unitsForFilter.map((v) => (
                <option key={v.id} value={v.id}>
                  {formatUnitLabel(v.unitNumber, v.plate)}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-gray-200 px-3 py-3 text-sm bg-white min-h-[48px]"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as (typeof STATUS_FILTERS)[number])
              }
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {filterLabel(s)}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileSearch className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No checkout reports match.</p>
            </div>
          ) : (
            filtered.map((report) => {
              const vehicle = vehicleMap[report.vehicleId];
              const company = companyMap[report.companyId];
              const flagged = isCheckoutFlagged(report);
              return (
                <Link key={report.id} href={`/office/${report.id}`}>
                  <Card className="hover:shadow-md transition-shadow mb-3">
                    <CardContent className="py-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">
                            {formatUnitLabel(
                              report.unitNumber,
                              vehicle?.plate
                            )}{" "}
                            · {report.year} {report.make} {report.model}
                          </CardTitle>
                          <p className="text-sm text-gray-500">
                            {company?.name ?? "Company"} ·{" "}
                            {report.type === "check_out"
                              ? "Check out"
                              : "Check in"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <ReviewStatusBadge status={report.reviewStatus} />
                          {flagged && (
                            <span className="text-[11px] font-semibold text-red-700">
                              Flagged
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        {report.driverName} · Disp. {report.dispatcherName} ·{" "}
                        {formatMileage(report.odometer)}
                      </p>
                      <p className="text-xs text-gray-400">
                        Complete {formatDate(report.completedAt)}
                      </p>
                      {report.newDamageNotes && (
                        <p className="text-sm text-orange-800 bg-orange-50 rounded-lg px-2 py-1">
                          New damage: {report.newDamageNotes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })
          )}
        </div>
      </OfficePinGate>
    </div>
  );
}
