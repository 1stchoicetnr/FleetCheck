"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { OfficePinGate } from "@/components/office-pin-gate";
import { ReviewStatusBadge } from "@/components/review-status-badge";
import { CheckoutPhotoComparison } from "@/components/checkout-photo-comparison";
import { useAuth } from "@/hooks/use-auth";
import { canReviewCheckout } from "@/lib/fleet-config";
import { getChecklistForCompany } from "@/lib/companies";
import { isCheckoutFlagged } from "@/lib/storage";
import {
  fetchCheckoutReport,
  fetchCompanies,
  fetchPriorReports,
  fetchVehicles,
  reviewCheckoutReport,
  SharedVehicle,
} from "@/lib/checkout-api";
import { getStoredOfficePin } from "@/lib/office-auth";
import {
  CheckoutReport,
  CheckoutReviewStatus,
  Company,
  PHOTO_ANGLES,
  PhotoAngle,
} from "@/lib/types";
import { formatDate, formatMileage, formatUnitLabel } from "@/lib/utils";

export default function OfficeReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const reportId = params.id as string;

  const [report, setReport] = useState<CheckoutReport | null>(null);
  const [reportReady, setReportReady] = useState(false);
  const [priors, setPriors] = useState<CheckoutReport[]>([]);
  const [vehicle, setVehicle] = useState<SharedVehicle | null>(null);
  const [saveError, setSaveError] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [decision, setDecision] = useState<CheckoutReviewStatus>("pass");
  const [reviewNotes, setReviewNotes] = useState("");
  const [newDamageNotes, setNewDamageNotes] = useState("");
  const [retakeAngles, setRetakeAngles] = useState<PhotoAngle[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"gallery" | "compare">("gallery");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    async function load() {
      try {
        const found = await fetchCheckoutReport(reportId);
        if (!found) {
          setReportReady(true);
          return;
        }
        setReport(found);
        setDecision(found.reviewStatus === "pending" ? "pass" : found.reviewStatus);
        setReviewNotes(found.reviewNotes ?? "");
        setNewDamageNotes(found.newDamageNotes ?? "");
        setRetakeAngles(found.retakeAngles ?? []);
        const [vehicles, companies, prior] = await Promise.all([
          fetchVehicles(found.companyId),
          fetchCompanies(),
          fetchPriorReports(found.vehicleId, found.id),
        ]);
        setVehicle(vehicles.find((item) => item.id === found.vehicleId) ?? null);
        setCompany(companies.find((item) => item.id === found.companyId) ?? null);
        setPriors(prior);
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : "Could not load this report from the shared server."
        );
      } finally {
        setReportReady(true);
      }
    }
    load();
  }, [reportId]);

  const steps = getChecklistForCompany(company);
  const photoMap = useMemo(
    () => Object.fromEntries(report?.photos.map((p) => [p.angle, p]) ?? []),
    [report]
  );

  const toggleRetake = (angle: PhotoAngle) => {
    setRetakeAngles((prev) =>
      prev.includes(angle) ? prev.filter((a) => a !== angle) : [...prev, angle]
    );
  };

  const handleSave = async () => {
    if (!report || !user) return;
    if (decision === "conditional" && retakeAngles.length === 0) return;
    setSaving(true);
    const updated: CheckoutReport = {
      ...report,
      reviewStatus: decision,
      reviewNotes: reviewNotes.trim() || undefined,
      newDamageNotes: newDamageNotes.trim() || undefined,
      retakeAngles: decision === "conditional" ? retakeAngles : undefined,
      reviewedAt: new Date().toISOString(),
      reviewedBy: user.name,
      flagged:
        decision === "conditional" ||
        decision === "fail" ||
        !!newDamageNotes.trim(),
    };
    setSaveError("");
    try {
      const saved = await reviewCheckoutReport(
        report.id,
        {
          reviewStatus: updated.reviewStatus,
          reviewNotes: updated.reviewNotes,
          newDamageNotes: updated.newDamageNotes,
          retakeAngles: updated.retakeAngles,
          reviewedBy: user.name,
        },
        getStoredOfficePin()
      );
      setReport(saved);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save review to the shared server."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user || !reportReady) return null;

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Report" backHref="/office" />
        <p className="text-center text-red-600 py-12">
          {saveError || "Report not found."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={`${formatUnitLabel(report.unitNumber, report.plate ?? vehicle?.plate)} review`}
        backHref="/office"
      />
      <OfficePinGate>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          <Card>
            <CardContent className="py-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>
                    {formatUnitLabel(report.unitNumber, report.plate ?? vehicle?.plate)} — {report.year}{" "}
                    {report.make} {report.model}
                  </CardTitle>
                  <p className="text-sm text-gray-500">
                    {company?.name ?? "Company"} ·{" "}
                    {report.type === "check_out" ? "Check out" : "Check in"}
                  </p>
                </div>
                <ReviewStatusBadge status={report.reviewStatus} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                <p>Odometer: {formatMileage(report.odometer)}</p>
                <p>Driver: {report.driverName}</p>
                <p>Dispatcher: {report.dispatcherName}</p>
                <p>Photos: {report.photos.length}</p>
              </div>
              <p className="text-xs text-gray-400">
                Complete {formatDate(report.completedAt)}
                {report.reviewedAt
                  ? ` · Reviewed ${formatDate(report.reviewedAt)} by ${report.reviewedBy}`
                  : ""}
              </p>
              {isCheckoutFlagged(report) && (
                <p className="text-sm font-semibold text-red-700">
                  In the flag queue
                  {report.newDamageNotes
                    ? ` — new damage: ${report.newDamageNotes}`
                    : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={tab === "gallery" ? "primary" : "secondary"}
              onClick={() => setTab("gallery")}
            >
              Gallery
            </Button>
            <Button
              size="sm"
              variant={tab === "compare" ? "primary" : "secondary"}
              onClick={() => setTab("compare")}
            >
              Compare to prior ({priors.length})
            </Button>
          </div>

          {tab === "gallery" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {steps.map((step) => {
                const photo = photoMap[step.angle];
                return (
                  <div
                    key={step.angle}
                    className="rounded-xl border border-gray-200 bg-white overflow-hidden"
                  >
                    <div className="aspect-video bg-gray-100">
                      {photo?.dataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photo.dataUrl}
                          alt={step.label}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-gray-400">
                          Missing
                        </div>
                      )}
                    </div>
                    <p className="px-2 py-1.5 text-xs font-semibold text-gray-700">
                      {step.label}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-4">
                <CardTitle className="text-base mb-3">
                  Side-by-side vs last 1–2 reports for this unit
                </CardTitle>
                <CheckoutPhotoComparison
                  current={report}
                  priors={priors}
                  highlightAngles={retakeAngles}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="py-5 space-y-4">
              <CardTitle className="text-base">Office decision</CardTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    ["pass", "PASS"],
                    ["conditional", "Conditional"],
                    ["fail", "FAIL"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDecision(value)}
                    className={`min-h-[52px] rounded-xl border-2 font-bold ${
                      decision === value
                        ? value === "pass"
                          ? "border-green-600 bg-green-50 text-green-800"
                          : value === "conditional"
                            ? "border-orange-500 bg-orange-50 text-orange-800"
                            : "border-red-600 bg-red-50 text-red-800"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {decision === "conditional" && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-800">
                    Retake list — tap slots to send back
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PHOTO_ANGLES.map((step) => {
                      const on = retakeAngles.includes(step.angle);
                      return (
                        <button
                          key={step.angle}
                          type="button"
                          onClick={() => toggleRetake(step.angle)}
                          className={`px-3 py-2 rounded-full text-xs font-semibold min-h-[40px] ${
                            on
                              ? "bg-orange-600 text-white"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {step.label}
                        </button>
                      );
                    })}
                  </div>
                  {retakeAngles.length === 0 && (
                    <p className="text-sm text-orange-700">
                      Select at least one slot to retake.
                    </p>
                  )}
                </div>
              )}

              <label className="block">
                <span className="block text-sm font-semibold text-gray-800 mb-1">
                  New damage vs prior
                </span>
                <textarea
                  value={newDamageNotes}
                  onChange={(e) => setNewDamageNotes(e.target.value)}
                  rows={3}
                  placeholder="Describe damage that was not on the last 1–2 reports…"
                  className="w-full rounded-xl border-2 border-gray-300 px-3 py-3 text-sm min-h-[80px]"
                />
              </label>

              <label className="block">
                <span className="block text-sm font-semibold text-gray-800 mb-1">
                  Review notes
                </span>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                  placeholder="Office notes for this report…"
                  className="w-full rounded-xl border-2 border-gray-300 px-3 py-3 text-sm min-h-[80px]"
                />
              </label>

              {saveError && (
                <p className="text-sm text-red-600 font-medium">{saveError}</p>
              )}

              <Button
                size="xl"
                className="w-full"
                onClick={handleSave}
                disabled={
                  saving ||
                  (decision === "conditional" && retakeAngles.length === 0)
                }
              >
                {saving ? "Saving…" : "Save review"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </OfficePinGate>
    </div>
  );
}
