"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { OfficePinGate } from "@/components/office-pin-gate";
import { ReviewStatusBadge } from "@/components/review-status-badge";
import { CheckoutPhotoComparison } from "@/components/checkout-photo-comparison";
import {
  LightboxPhoto,
  OfficePhotoThumb,
  PhotoLightbox,
} from "@/components/photo-lightbox";
import { useAuth } from "@/hooks/use-auth";
import { canManageOfficeRecords, canReviewCheckout, isOwnerAccount } from "@/lib/fleet-config";
import { getChecklistForCompany } from "@/lib/companies";
import { photoStepsForCompany, usesClover as cloverEnabled } from "@/lib/company-settings";
import type { PublicCompanySettings } from "@/lib/company-settings";
import { isCheckoutFlagged } from "@/lib/storage";
import {
  deleteCheckoutReport,
  fetchCheckoutReport,
  markCheckoutSent,
  fetchCompanies,
  fetchCompanySettings,
  fetchPriorReports,
  fetchVehicles,
  resendCheckoutToSlack,
  flagCheckoutPhoto,
  reviewCheckoutReport,
  setCheckoutReportArchived,
  SharedVehicle,
} from "@/lib/checkout-api";
import { getStoredOfficePin } from "@/lib/office-auth";
import {
  CheckoutReport,
  CheckoutReviewStatus,
  Company,
  PHOTO_ANGLES,
  PhotoAngle,
  photoStepsForReport,
  walkaroundPhotoSteps,
} from "@/lib/types";
import { downloadCheckoutReportFile } from "@/lib/pdf-download";
import { formatCheckoutTime } from "@/lib/checkout-slack";
import { formatDateOnly, formatMileage, formatUnitLabel } from "@/lib/utils";
import { isVehicleArchived } from "@/lib/vehicle-archive";
import {
  cleanDamageNote,
  damageFlagText,
  DAMAGE_NOTE_MAX,
  isPhotoDamageFlagged,
  sortAnglesDamageFirst,
} from "@/lib/photo-flags";
import { Download } from "lucide-react";
import { InspectionFormSummary, TrafficLightBadge } from "@/components/inspection-form-summary";
import {
  CLOVER_SERIAL_LABEL,
  formatCloverSerial,
  UNIT_NUMBER_LABEL,
} from "@/lib/inspection-form";
import { RAD_CAB_COMPANY_ID } from "@/lib/company-rules";

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
  const [decision, setDecision] = useState<CheckoutReviewStatus | "">("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [newDamageNotes, setNewDamageNotes] = useState("");
  const [retakeAngles, setRetakeAngles] = useState<PhotoAngle[]>([]);
  const [saving, setSaving] = useState(false);
  const [slackSending, setSlackSending] = useState(false);
  const [markSending, setMarkSending] = useState(false);
  const [markNote, setMarkNote] = useState("");
  const [slackNote, setSlackNote] = useState("");
  const [tab, setTab] = useState<"gallery" | "compare">("gallery");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [flaggingAngle, setFlaggingAngle] = useState<PhotoAngle | null>(null);
  const [officeReady, setOfficeReady] = useState(false);
  const [companySettings, setCompanySettings] = useState<PublicCompanySettings | null>(null);
  const [recordAction, setRecordAction] = useState<null | "archive" | "delete">(null);
  const [recordBusy, setRecordBusy] = useState(false);
  const markOfficeUnlocked = useCallback(() => setOfficeReady(true), []);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canReviewCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (!officeReady) return;
    async function load() {
      try {
        const found = await fetchCheckoutReport(reportId);
        if (!found) {
          setReportReady(true);
          return;
        }
        setReport(found);
        setDecision(found.reviewStatus === "pending" ? "" : found.reviewStatus);
        setReviewNotes(found.reviewNotes ?? "");
        setNewDamageNotes(found.newDamageNotes ?? "");
        setRetakeAngles(found.retakeAngles ?? []);
        const [vehicles, companies] = await Promise.all([
          fetchVehicles(found.companyId, { includeArchived: true }),
          fetchCompanies(),
        ]);
        setVehicle(vehicles.find((item) => item.id === found.vehicleId) ?? null);
        setCompany(companies.find((item) => item.id === found.companyId) ?? null);
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
  }, [officeReady, reportId]);

  const priorVehicleId = report?.vehicleId;
  const priorReportId = report?.id;
  useEffect(() => {
    if (!officeReady || tab !== "compare" || !priorVehicleId || !priorReportId) return;
    let cancelled = false;
    fetchPriorReports(priorVehicleId, priorReportId)
      .then((prior) => {
        if (!cancelled) setPriors(prior);
      })
      .catch(() => {
        if (!cancelled) setPriors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [officeReady, tab, priorVehicleId, priorReportId]);

  useEffect(() => {
    void fetchCompanySettings().then(setCompanySettings).catch(() => {});
  }, []);

  const steps = photoStepsForReport(
    companySettings
      ? photoStepsForCompany(companySettings, report?.companyId)
      : getChecklistForCompany(company),
    report?.photos ?? []
  );
  const photoMap = useMemo(
    () => Object.fromEntries(report?.photos.map((p) => [p.angle, p]) ?? []),
    [report]
  );
  const gallerySteps = useMemo(
    () => sortAnglesDamageFirst(steps, report?.photos ?? []),
    [steps, report]
  );
  const galleryPhotos = useMemo<LightboxPhoto[]>(
    () =>
      gallerySteps.flatMap((step) => {
        const photo = photoMap[step.angle];
        return photo?.dataUrl
          ? [{
              id: step.angle,
              src: photo.dataUrl,
              label: isPhotoDamageFlagged(photo)
                ? damageFlagText(photo, report?.driverName)
                : step.label,
            }]
          : [];
      }),
    [photoMap, gallerySteps, report?.driverName]
  );

  const handleFlagPhoto = async (
    angle: PhotoAngle,
    flaggedDamage: boolean,
    damageNote?: string
  ) => {
    if (!report) return;
    setFlaggingAngle(angle);
    setSaveError("");
    try {
      const saved = await flagCheckoutPhoto(
        report.id,
        angle,
        flaggedDamage,
        getStoredOfficePin(),
        damageNote
      );
      setReport(saved);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not update the damage flag."
      );
    } finally {
      setFlaggingAngle(null);
    }
  };

  const toggleRetake = (angle: PhotoAngle) => {
    setRetakeAngles((prev) =>
      prev.includes(angle) ? prev.filter((a) => a !== angle) : [...prev, angle]
    );
  };

  const handleDownload = async () => {
    if (!report) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadCheckoutReportFile(report, {
        companyName: company?.name,
        plate: report.plate ?? vehicle?.plate,
        steps,
      });
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Could not build the report PDF."
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleSave = async () => {
    if (!report || !user || !decision) return;
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

  const handleRecordAction = async () => {
    if (!report || !recordAction) return;
    setRecordBusy(true);
    setSaveError("");
    try {
      if (recordAction === "delete") {
        await deleteCheckoutReport(report.id);
        router.push("/office");
        return;
      }
      const saved = await setCheckoutReportArchived(report.id, !report.archivedAt);
      setReport(saved);
      setRecordAction(null);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not update this report."
      );
      setRecordAction(null);
    } finally {
      setRecordBusy(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={
          report
            ? `${formatUnitLabel(report.unitNumber, report.plate ?? vehicle?.plate)} review`
            : "Report"
        }
        backHref="/office"
      />
      <OfficePinGate onUnlocked={markOfficeUnlocked}>
        {!reportReady ? (
          <p className="text-center text-brand-600 py-12 font-semibold">Loading…</p>
        ) : !report ? (
          <p className="text-center text-red-600 py-12">
            {saveError || "Report not found."}
          </p>
        ) : (
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
                <div className="flex flex-col items-end gap-1">
                  <ReviewStatusBadge status={report.reviewStatus} />
                  {vehicle && isVehicleArchived(vehicle) && (
                    <span className="text-[11px] font-semibold text-gray-600">
                      Archived unit
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                <p>
                  Date:{" "}
                  {formatDateOnly(
                    report.inspectionForm?.inspectedAt || report.completedAt
                  )}
                </p>
                <p>Name: {report.driverName}</p>
                <p>
                  {UNIT_NUMBER_LABEL}: {report.unitNumber}
                </p>
                {cloverEnabled(companySettings, report.companyId) ? (
                <p>
                  {CLOVER_SERIAL_LABEL}: {formatCloverSerial(report.inspectionForm)}
                </p>
                ) : null}
                <p>Odometer start: {formatMileage(report.odometer)}</p>
                <p>Dispatcher: {report.dispatcherName}</p>
                <p>Photos: {report.photos.length}</p>
              </div>
              {report.inspectionForm && (
                <div className="pt-1">
                  <TrafficLightBadge form={report.inspectionForm} />
                </div>
              )}
              <p className="text-xs text-gray-400">
                Complete {formatCheckoutTime(report.completedAt)}
                {report.reviewedAt
                  ? ` · Reviewed ${formatCheckoutTime(report.reviewedAt)} by ${report.reviewedBy}`
                  : ""}
              </p>
              {user && canReviewCheckout(user.role) && !report.sentAt && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    disabled={markSending}
                    onClick={() => {
                      setMarkSending(true);
                      setMarkNote("");
                      void markCheckoutSent(report.id)
                        .then((updated) => {
                          setReport((current) =>
                            current
                              ? { ...current, sentAt: updated.sentAt, status: updated.status }
                              : current
                          );
                          setMarkNote("Marked sent. The result was not changed.");
                        })
                        .catch((err: Error) => {
                          setMarkNote(err.message || "Could not mark this check sent.");
                        })
                        .finally(() => setMarkSending(false));
                    }}
                  >
                    {markSending ? "Saving…" : "Mark sent"}
                  </Button>
                  <p className="text-xs text-gray-500">
                    Records that the upload finished. Photos, mileage, and the pass or fail result stay as they are.
                    If Slack does not have it yet, it is posted once.
                  </p>
                  {markNote && (
                    <p className="text-sm font-semibold text-ink" role="status">
                      {markNote}
                    </p>
                  )}
                </div>
              )}
              {user && isOwnerAccount(user) && report.companyId === RAD_CAB_COMPANY_ID && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    disabled={slackSending}
                    onClick={() => {
                      setSlackSending(true);
                      setSlackNote("");
                      void resendCheckoutToSlack(report.id)
                        .then((status) => {
                          if (status === "sent") setSlackNote("Posted to Slack.");
                          else if (status === "already_sent") {
                            setSlackNote("This check is already in Slack.");
                          } else setSlackNote("Slack did not accept it. Try again in a minute.");
                        })
                        .catch(() => {
                          setSlackNote("Slack did not accept it. Try again in a minute.");
                        })
                        .finally(() => setSlackSending(false));
                    }}
                  >
                    {slackSending ? "Sending…" : "Resend to Slack"}
                  </Button>
                  {slackNote && (
                    <p className="text-sm font-semibold text-ink" role="status">
                      {slackNote}
                    </p>
                  )}
                </div>
              )}
              {report.signatureDataUrl && (
                <div className="rounded-xl border border-gray-300 bg-gray-50 p-2">
                  <p className="text-xs font-semibold text-gray-600 mb-1">
                    Driver signature · {report.driverName}
                    {report.signedAt ? ` · ${formatCheckoutTime(report.signedAt)}` : ""}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={report.signatureDataUrl}
                    alt={`Signature of ${report.driverName}`}
                    className="h-28 w-full object-contain bg-white rounded-lg border border-gray-200"
                  />
                </div>
              )}
              {vehicle && isVehicleArchived(vehicle) && (
                <p className="text-sm text-gray-700 bg-gray-100 rounded-lg px-2 py-1">
                  This unit is archived / out of service. History is kept —
                  drivers no longer see it in Checkout.
                </p>
              )}
              {report.archivedAt && (
                <p className="text-sm text-gray-700 bg-gray-100 rounded-lg px-2 py-1">
                  This report is archived and hidden from the default office list.
                </p>
              )}
              {user && canManageOfficeRecords(user.role) && (
                <div className="flex gap-2 pt-1">
                  {(!report.archivedAt || isOwnerAccount(user)) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setRecordAction("archive")}
                  >
                    {report.archivedAt ? "Restore report" : "Archive report"}
                  </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    className="flex-1"
                    onClick={() => setRecordAction("delete")}
                  >
                    Delete report
                  </Button>
                </div>
              )}
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

          <Card>
            <CardContent className="py-4 space-y-3">
              <CardTitle className="text-base">Precheck</CardTitle>
              {report.inspectionForm ? (
                <InspectionFormSummary
                  form={report.inspectionForm}
                  driverName={report.driverName}
                  showClover={cloverEnabled(companySettings, report.companyId)}
                />
              ) : (
                <p className="text-sm text-gray-500">
                  No Precheck on this report (submitted before Precheck was
                  added).
                </p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button
              size="xl"
              className="w-full"
              onClick={handleDownload}
              disabled={downloading}
            >
              <Download className="h-5 w-5 mr-2" />
              {downloading ? "Preparing PDF…" : "Download report (PDF)"}
            </Button>
            <p className="text-xs text-gray-500 text-center">
              Inspection Precheck and photos — one file for Slack / #radcabcr.
            </p>
            {downloadError && (
              <p className="text-sm text-red-600 font-medium text-center">
                {downloadError}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={tab === "gallery" ? "primary" : "secondary"}
              onClick={() => {
                setTab("gallery");
                setLightboxIndex(null);
              }}
            >
              Gallery
            </Button>
            <Button
              size="sm"
              variant={tab === "compare" ? "primary" : "secondary"}
              onClick={() => {
                setTab("compare");
                setLightboxIndex(null);
              }}
            >
              Compare to prior ({priors.length})
            </Button>
          </div>

          {tab === "gallery" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gallerySteps.map((step) => {
                const photo = photoMap[step.angle];
                const damaged = isPhotoDamageFlagged(photo);
                return (
                  <div
                    key={step.angle}
                    className={`rounded-xl border bg-white overflow-hidden ${
                      damaged ? "border-red-400 ring-2 ring-red-200" : "border-gray-200"
                    }`}
                  >
                    <div className="aspect-video bg-gray-100">
                      {photo?.dataUrl ? (
                        <OfficePhotoThumb
                          src={photo.dataUrl}
                          label={
                            damaged
                              ? damageFlagText(photo, report.driverName)
                              : step.label
                          }
                          onOpen={() => {
                            const next = galleryPhotos.findIndex(
                              (item) => item.id === step.angle
                            );
                            if (next >= 0) setLightboxIndex(next);
                          }}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-gray-400">
                          Missing
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-1.5 space-y-1">
                      <p className="text-xs font-semibold text-gray-700">
                        {step.label}
                        {damaged ? ` · DAMAGE · ${report.driverName}` : ""}
                      </p>
                      {damaged && cleanDamageNote(photo?.damageNote) && (
                        <p className="text-[11px] text-red-800 leading-snug">
                          {cleanDamageNote(photo?.damageNote)}
                        </p>
                      )}
                      {photo?.dataUrl && (
                        <button
                          type="button"
                          disabled={flaggingAngle === step.angle}
                          onClick={() =>
                            handleFlagPhoto(
                              step.angle,
                              !damaged,
                              damaged ? "" : photo.damageNote
                            )
                          }
                          className={`w-full min-h-[36px] rounded-lg text-[11px] font-semibold disabled:opacity-100 ${
                            damaged
                              ? "bg-[#fee2e2] text-[#7f1d1d] disabled:bg-[#fee2e2] disabled:text-[#7f1d1d]"
                              : "bg-[#2a2a2e] text-[#e4e4e7] disabled:bg-[#2a2a2e] disabled:text-[#d4d4d8]"
                          }`}
                        >
                          {flaggingAngle === step.angle
                            ? "Saving…"
                            : damaged
                              ? "Clear DAMAGE"
                              : "Flag DAMAGE"}
                        </button>
                      )}
                      {damaged && photo && (
                        <DamageNoteEditor
                          key={`${step.angle}:${photo.damageNote ?? ""}`}
                          note={photo.damageNote ?? ""}
                          saving={flaggingAngle === step.angle}
                          onSave={(note) => handleFlagPhoto(step.angle, true, note)}
                        />
                      )}
                    </div>
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
                    {walkaroundPhotoSteps(PHOTO_ANGLES).map((step) => {
                      const on = retakeAngles.includes(step.angle);
                      return (
                        <button
                          key={step.angle}
                          type="button"
                          onClick={() => toggleRetake(step.angle)}
                          className={`px-3 py-2 rounded-full text-xs font-semibold min-h-[40px] ${
                            on
                              ? "bg-[#f97316] text-[#1c1917]"
                              : "bg-[#2a2a2e] text-[#e4e4e7]"
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
                  !decision ||
                  (decision === "conditional" && retakeAngles.length === 0)
                }
              >
                {saving ? "Saving…" : decision ? "Save review" : "Choose PASS, Conditional, or FAIL"}
              </Button>
            </CardContent>
          </Card>
        </div>
        )}
      </OfficePinGate>
      <ConfirmDialog
        open={recordAction !== null}
        title={
          report
            ? `${recordAction === "delete" ? "Delete" : report.archivedAt ? "Restore" : "Archive"} ${formatUnitLabel(report.unitNumber, report.plate)} ${report.type === "check_in" ? "check-in" : "check-out"} from ${formatCheckoutTime(report.completedAt)}?`
            : "Update this report?"
        }
        body={
          recordAction === "delete"
            ? "This permanently removes that office record and its photos. This cannot be undone."
            : report?.archivedAt
              ? "That report will show in the default office list again."
              : "That report stays on file and disappears from the default office list. Turn on Show archived reports to see it."
        }
        confirmLabel={recordAction === "delete" ? "Delete report" : report?.archivedAt ? "Restore" : "Archive"}
        danger={recordAction === "delete"}
        busy={recordBusy}
        onConfirm={() => void handleRecordAction()}
        onCancel={() => {
          if (!recordBusy) setRecordAction(null);
        }}
      />
      <PhotoLightbox
        photos={galleryPhotos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}

function DamageNoteEditor({
  note,
  saving,
  onSave,
}: {
  note: string;
  saving: boolean;
  onSave: (note: string) => void;
}) {
  const [value, setValue] = useState(note);
  const dirty = value.trim() !== note.trim();
  return (
    <div className="space-y-1">
      <textarea
        value={value}
        maxLength={DAMAGE_NOTE_MAX}
        rows={2}
        placeholder="Damage note (optional)"
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-[11px]"
      />
      {dirty && (
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(value)}
          className="w-full min-h-[32px] rounded-lg bg-[#22c55e] text-[#052e16] text-[11px] font-semibold disabled:bg-[#14532d] disabled:text-[#ecfdf5] disabled:opacity-100"
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      )}
    </div>
  );
}
