"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { OfficePinGate } from "@/components/office-pin-gate";
import { ReviewStatusBadge } from "@/components/review-status-badge";
import { DeliveryBadge } from "@/components/delivery-badge";
import { useAuth } from "@/hooks/use-auth";
import { canReviewCheckout, isOwnerAccount } from "@/lib/fleet-config";
import { canReviewAccessRequests, settingsSections } from "@/lib/home-menu";
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
import { OFFICE_REPORT_PAGE_SIZE } from "@/lib/office-list";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import { formatMileage, formatUnitLabel } from "@/lib/utils";
import { isVehicleArchived } from "@/lib/vehicle-archive";
import { Flag, FileSearch } from "lucide-react";
import { activeIssueFlagLabels, trafficLightLabel } from "@/lib/inspection-form";

const STATUS_FILTERS: Array<CheckoutReviewStatus | "all" | "flagged"> = [
  "all",
  "flagged",
  "pending",
  "pass",
  "conditional",
  "fail",
];

function filterLabel(value: (typeof STATUS_FILTERS)[number] | "archived"): string {
  if (value === "all") return "All";
  if (value === "flagged") return "Flag queue";
  if (value === "pending") return "Pending";
  if (value === "pass") return "PASS";
  if (value === "conditional") return "Conditional";
  if (value === "archived") return "Archived";
  return "FAIL";
}

function OfficeReportsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<CheckoutReport[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [flagCount, setFlagCount] = useState(0);
  const [stuckCount, setStuckCount] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vehicles, setVehicles] = useState<SharedVehicle[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const requestRef = useRef(0);
  const [companyId, setCompanyId] = useState("all");
  const [unitId, setUnitId] = useState("all");
  const [showArchivedUnits, setShowArchivedUnits] = useState(false);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number] | "archived">("all");
  const [officeReady, setOfficeReady] = useState(false);
  const [listReady, setListReady] = useState(false);
  const markOfficeUnlocked = useCallback(() => setOfficeReady(true), []);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  const loadOffice = useCallback(
    (offset = 0, background = false) => {
      const requestId = ++requestRef.current;
      if (offset === 0 && !background) setListReady(false);
      if (offset > 0) setLoadingMore(true);
      Promise.all([
        fetchCheckoutReports({
          includeArchived: status === "archived",
          companyId: companyId === "all" ? undefined : companyId,
          vehicleId: unitId === "all" ? undefined : unitId,
          status,
          limit: OFFICE_REPORT_PAGE_SIZE,
          offset,
        }),
        fetchCompanies(),
        fetchVehicles(undefined, { includeArchived: true }),
      ])
        .then(([page, c, v]) => {
          if (requestId !== requestRef.current) return;
          setReports((prev) =>
            offset === 0 ? page.reports : [...prev, ...page.reports]
          );
          setReportTotal(page.total);
          setFlagCount(page.flagged);
          setStuckCount(page.stuck ?? 0);
          setCompanies(c);
          setVehicles(v);
          setLoadError("");
        })
        .catch((err: Error) => {
          if (requestId !== requestRef.current) return;
          setLoadError(err.message || "Could not load shared checkout reports.");
        })
        .finally(() => {
          if (requestId !== requestRef.current) return;
          setListReady(true);
          setLoadingMore(false);
        });
    },
    [companyId, unitId, status]
  );

  useEffect(() => {
    if (!officeReady) return;
    loadOffice(0);
    const onVis = () => {
      if (document.visibilityState === "visible") loadOffice(0, true);
    };
    const onFocus = () => loadOffice(0, true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [officeReady, loadOffice]);

  useEffect(() => {
    const requestedUnit = searchParams.get("unitId");
    if (!requestedUnit || vehicles.length === 0) return;
    const vehicle = vehicles.find((v) => v.id === requestedUnit);
    if (!vehicle) {
      setUnitId(requestedUnit);
      setShowArchivedUnits(true);
      return;
    }
    setCompanyId(vehicle.companyId);
    setUnitId(vehicle.id);
    if (isVehicleArchived(vehicle)) setShowArchivedUnits(true);
  }, [searchParams, vehicles]);

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));
  const vehicleMap = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const archivedIds = useMemo(
    () => new Set(vehicles.filter(isVehicleArchived).map((v) => v.id)),
    [vehicles]
  );

  const unitsForFilter = useMemo(() => {
    const byId = new Map<
      string,
      {
        id: string;
        unitNumber: string;
        plate: string;
        companyId: string;
        archivedAt?: string;
      }
    >();
    for (const v of vehicles) {
      if (companyId !== "all" && v.companyId !== companyId) continue;
      if (!showArchivedUnits && isVehicleArchived(v) && v.id !== unitId) continue;
      byId.set(v.id, v);
    }
    for (const report of reports) {
      if (companyId !== "all" && report.companyId !== companyId) continue;
      if (byId.has(report.vehicleId)) continue;
      if (
        !showArchivedUnits &&
        archivedIds.has(report.vehicleId) &&
        report.vehicleId !== unitId
      ) {
        continue;
      }
      byId.set(report.vehicleId, {
        id: report.vehicleId,
        unitNumber: report.unitNumber,
        plate: report.plate ?? "",
        companyId: report.companyId,
      });
    }
    return [...byId.values()].sort((a, b) =>
      a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
    );
  }, [vehicles, reports, companyId, showArchivedUnits, archivedIds, unitId]);

  const filtered = reports;

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Office — Checkout reports" />
      <OfficePinGate onUnlocked={markOfficeUnlocked}>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {loadError && (
            <p className="text-sm text-red-600 font-medium">{loadError}</p>
          )}
          {stuckCount > 0 && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
              {stuckCount} check{stuckCount === 1 ? "" : "s"} stuck uploading for more than 30 minutes.
            </p>
          )}

          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Checkout reports
              </h2>
              <p className="text-sm text-gray-500">
                {listReady
                  ? `${filtered.length} of ${reportTotal} shown · ${flagCount} flagged · ${stuckCount} stuck`
                  : "Loading reports…"}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                <button
                  type="button"
                  onClick={() => loadOffice(0)}
                  className="text-xs font-semibold text-brand-700 underline underline-offset-2"
                >
                  Refresh from server
                </button>
                <Link
                  href="/vehicles"
                  className="text-xs font-semibold text-brand-700 underline underline-offset-2"
                >
                  Units
                </Link>
                <Link
                  href="/office/feedback"
                  className="text-xs font-semibold text-brand-700 underline underline-offset-2"
                >
                  App feedback
                </Link>
                {settingsSections(user).length > 0 && (
                  <Link
                    href="/settings"
                    className="text-xs font-semibold text-brand-700 underline underline-offset-2"
                  >
                    Settings
                  </Link>
                )}
                {canReviewAccessRequests(user) && (
                  <Link
                    href="/office/people"
                    className="text-xs font-semibold text-brand-700 underline underline-offset-2"
                  >
                    People and invites
                  </Link>
                )}
              </div>
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
                  {isVehicleArchived(v) ? " (archived)" : ""}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-gray-200 px-3 py-3 text-sm bg-white min-h-[48px]"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as (typeof STATUS_FILTERS)[number] | "archived")
              }
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {filterLabel(s)}
                </option>
              ))}
              {isOwnerAccount(user) && <option value="archived">Archived</option>}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={showArchivedUnits}
              onChange={(e) => {
                const next = e.target.checked;
                setShowArchivedUnits(next);
                if (!next && archivedIds.has(unitId)) setUnitId("all");
              }}
            />
            Include archived units in the unit filter. Past reports still show
            under All units.
          </label>
          {!listReady ? (
            <p className="text-center text-brand-600 font-semibold py-12">Loading reports…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 rounded-2xl border border-dashed border-line bg-surface">
              <FileSearch className="h-12 w-12 mx-auto text-muted mb-3" />
              <p className="text-ink font-semibold">No checkout reports match.</p>
              <p className="text-sm text-muted mt-1">Try another company, unit, or status.</p>
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
                              report.plate ?? vehicle?.plate
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
                            <span className="text-[11px] font-semibold text-red-300">
                              Flagged
                            </span>
                          )}
                          {report.archivedAt && (
                            <span className="text-[11px] font-semibold text-gray-600">
                              Archived report
                            </span>
                          )}
                          {vehicle && isVehicleArchived(vehicle) && (
                            <span className="text-[11px] font-semibold text-gray-600">
                              Archived unit
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        {report.driverName} · Disp. {report.dispatcherName} ·{" "}
                        {formatMileage(report.odometer)}
                      </p>
                      {report.inspectionForm && (
                        <p className="text-xs text-gray-600">
                          {report.inspectionForm.trafficLight
                            ? `${trafficLightLabel(report.inspectionForm.trafficLight)} · `
                            : ""}
                          Interior{" "}
                          {report.inspectionForm.interiorClean === "yes"
                            ? "Yes"
                            : report.inspectionForm.interiorClean === "no"
                              ? "No"
                              : "—"}
                          {" · "}
                          Exterior{" "}
                          {report.inspectionForm.exteriorClean === "yes"
                            ? "Yes"
                            : report.inspectionForm.exteriorClean === "no"
                              ? "No"
                              : "—"}
                          {activeIssueFlagLabels(report.inspectionForm).length
                            ? ` · ${activeIssueFlagLabels(report.inspectionForm).join(", ")}`
                            : ""}
                          {report.inspectionForm.additionalComments?.trim()
                            ? ` · ${report.inspectionForm.additionalComments.trim()}`
                            : ""}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <DeliveryBadge createdAt={report.createdAt} sentAt={report.sentAt} />
                        <p className="text-xs text-gray-400">
                          Complete {formatCheckoutTime(report.completedAt)}
                        </p>
                      </div>
                      {report.newDamageNotes && (
                        <p className="text-sm text-orange-800 bg-orange-50 rounded-lg px-2 py-1">
                          New damage: {report.newDamageNotes}
                        </p>
                      )}
                      {report.reviewNotes && (
                        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-2 py-1">
                          {report.reviewNotes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })
          )}
          {listReady && filtered.length < reportTotal && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => loadOffice(filtered.length)}
              className="w-full min-h-[48px] rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800"
            >
              {loadingMore
                ? "Loading…"
                : `Load more (${filtered.length} of ${reportTotal})`}
            </button>
          )}
        </div>
      </OfficePinGate>
    </div>
  );
}

export default function OfficeReportsPageWithSearch() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-brand-600">Loading...</div>
        </div>
      }
    >
      <OfficeReportsPage />
    </Suspense>
  );
}
