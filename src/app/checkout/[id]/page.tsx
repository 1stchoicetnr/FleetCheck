"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { CheckoutAccountBanner } from "@/components/checkout-account-notice";
import { CHECKOUT_ACCOUNT_MESSAGE } from "@/lib/checkout-account";
import { Button } from "@/components/ui/button";
import { GuidedPhotoCapture } from "@/components/guided-photo-capture";
import { SignaturePad } from "@/components/signature-pad";
import { useAuth } from "@/hooks/use-auth";
import { canStartCheckout } from "@/lib/fleet-config";
import { canSkipPhotosForTesting } from "@/lib/dev-config";
import {
  photoStepsForCompany,
  publicCompanySettings,
  usesClover as cloverEnabled,
} from "@/lib/company-settings";
import type { PublicCompanySettings } from "@/lib/company-settings";
import {
  getCachedCompanies,
  getCachedVehicles,
  getCheckoutDraft,
  saveCachedCompanies,
  saveCachedVehicles,
  saveCheckoutDraft,
} from "@/lib/storage";
import {
  fetchCompanies,
  fetchCompanySettings,
  fetchVehicles,
  SharedVehicle,
} from "@/lib/checkout-api";
import { submitCheckoutFromDraft } from "@/lib/checkout-outbox";
import { isGenericDriverName } from "@/lib/driver-name";
import {
  CheckoutDraft,
  CheckoutReport,
  Company,
  PhotoAngle,
} from "@/lib/types";
import { downloadCheckoutReportFile } from "@/lib/pdf-download";
import {
  applyPowertrainToForm,
  canContinueToPhotos,
  CLOVER_SERIAL_LABEL,
  cloverSerialOf,
  createEmptyInspectionForm,
  inferPowertrain,
  isPrecheckRed,
  UNIT_NUMBER_LABEL,
  validateInspectionForm,
} from "@/lib/inspection-form";
import { formatDate, formatDateOnly, formatUnitLabel } from "@/lib/utils";
import { PHOTO_EXAMPLE_PATHS } from "@/lib/photo-examples";
import { InspectionFormFields } from "@/components/inspection-form-fields";
import { InspectionFormSummary } from "@/components/inspection-form-summary";
import { Check } from "lucide-react";
import { restoreNaturalOrientation } from "@/lib/orientation";
import { useCheckoutFeedbackMeta } from "@/components/checkout-feedback";

function vehicleFromDraft(draft: CheckoutDraft): SharedVehicle {
  return {
    id: draft.vehicleId,
    companyId: draft.companyId,
    unitNumber: draft.unitNumber || "Unit",
    plate: draft.plate || "",
    make: draft.make,
    model: draft.model,
    year: Number(draft.year) || 0,
    createdAt: draft.updatedAt,
  };
}

function companyFromDraft(draft: CheckoutDraft): Company {
  return {
    id: draft.companyId,
    name: draft.companyName || "Company",
    slug: "cached",
    checklistId: draft.checklistId || "radcab_default",
    createdAt: draft.updatedAt,
  };
}

function CheckoutCapturePage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const draftId = params.id as string;
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState<CheckoutDraft | null>(null);
  const [vehicle, setVehicle] = useState<SharedVehicle | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [photos, setPhotos] = useState<Partial<Record<PhotoAngle, string>>>({});
  const [photoFlags, setPhotoFlags] = useState<
    NonNullable<CheckoutDraft["photoFlags"]>
  >({});
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadEstimate, setUploadEstimate] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [completed, setCompleted] = useState<CheckoutReport | null>(null);
  const [savedOnPhone, setSavedOnPhone] = useState(false);
  const [photosReady, setPhotosReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [inspectionForm, setInspectionForm] = useState(() =>
    createEmptyInspectionForm("gas")
  );
  const [phase, setPhase] = useState<"inspect" | "photos" | "review">("inspect");
  const [companySettings, setCompanySettings] = useState<PublicCompanySettings | null>(null);
  const [showPrecheckErrors, setShowPrecheckErrors] = useState(false);

  useCheckoutFeedbackMeta({
    unitId: vehicle?.id,
    unitNumber: vehicle?.unitNumber,
    plate: vehicle?.plate,
    pagePhase: completed ? "complete" : phase,
    driverName: draft?.driverName || user?.name,
  });

  useEffect(() => {
    if (user && !canStartCheckout(user.role)) router.replace("/dashboard");
  }, [user, router]);

  useEffect(() => {
    void restoreNaturalOrientation();
  }, []);

  useEffect(() => {
    async function load() {
      const d = await getCheckoutDraft(draftId);
      if (!d) {
        router.replace("/checkout");
        return;
      }
      setDraft(d);
      setPhotos(d.photos);
      setPhotoFlags(d.photoFlags ?? {});
      setSignatureDataUrl(d.signatureDataUrl ?? "");
      setSignedAt(d.signedAt ?? "");
      const powertrain = inferPowertrain(d.make, d.model, d.inspectionForm?.powertrain);
      const form = applyPowertrainToForm(
        d.inspectionForm ??
          createEmptyInspectionForm(powertrain, {
            inspectedAt: new Date().toISOString(),
          }),
        powertrain
      );
      setInspectionForm(form);
      const formOk = validateInspectionForm(form, powertrain, {
        includeClover: cloverEnabled(null, d.companyId),
      }).ok;
      const resumeReview = searchParams.get("phase") === "review" && formOk;
      setPhase(resumeReview ? "review" : formOk && !isPrecheckRed(form) ? "photos" : "inspect");
      const applyUnit = (found: SharedVehicle | null, companies: Company[]) => {
        setVehicle(found);
        if (found?.archivedAt) {
          setLoadError(
            "This unit is archived / out of service. Ask Office to unarchive it before submitting a new checkout."
          );
        }
        setCompany(companies.find((item) => item.id === d.companyId) ?? companyFromDraft(d));
      };
      try {
        const [vehicles, companies] = await Promise.all([
          fetchVehicles(d.companyId, { includeArchived: true }),
          fetchCompanies(),
        ]);
        void saveCachedCompanies(companies);
        void saveCachedVehicles(d.companyId, vehicles);
        applyUnit(vehicles.find((item) => item.id === d.vehicleId) ?? null, companies);
      } catch {
        const [cachedVehicles, cachedCompanies] = await Promise.all([
          getCachedVehicles(d.companyId),
          getCachedCompanies(),
        ]);
        const companies = cachedCompanies?.length ? cachedCompanies : [companyFromDraft(d)];
        const cached = cachedVehicles?.find((item) => item.id === d.vehicleId);
        const found = (cached as SharedVehicle | undefined) ?? vehicleFromDraft(d);
        applyUnit(found, companies);
      }
    }
    load();
  }, [draftId, router, searchParams]);

  useEffect(() => {
    if (!draft || !vehicle) return;
    const next = inferPowertrain(draft.make, draft.model, vehicle.powertrain);
    setInspectionForm((prev) => applyPowertrainToForm(prev, next));
  }, [draft, vehicle]);

  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      void saveCheckoutDraft({
        ...draft,
        photos,
        photoFlags,
        inspectionForm,
        signatureDataUrl: signatureDataUrl || undefined,
        signedAt: signedAt || undefined,
        unitNumber: vehicle?.unitNumber || draft.unitNumber,
        plate: vehicle?.plate || draft.plate,
        companyName: company?.name || draft.companyName,
        checklistId: company?.checklistId || draft.checklistId,
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, photos, photoFlags, inspectionForm, signatureDataUrl, signedAt, vehicle, company]);

  useEffect(() => {
    if (isPrecheckRed(inspectionForm)) setPhase("inspect");
  }, [inspectionForm]);

  useEffect(() => {
    void fetchCompanySettings().then(setCompanySettings).catch(() => {});
  }, []);

  const steps = photoStepsForCompany(
    companySettings ?? publicCompanySettings(null),
    draft?.companyId || company?.id
  );
  const required = steps.filter((s) => s.required);
  const allFilled = required.every((s) => photos[s.angle]);
  const powertrain = inferPowertrain(
    draft?.make,
    draft?.model,
    vehicle?.powertrain || inspectionForm.powertrain
  );
  const usesClover = cloverEnabled(companySettings, draft?.companyId);
  const inspectionOptions = { includeClover: usesClover };
  const inspectionValid = validateInspectionForm(
    inspectionForm,
    powertrain,
    inspectionOptions
  );
  const redPark = isPrecheckRed(inspectionValid.ok ? inspectionValid.form : inspectionForm);
  const photosNeeded = !redPark;
  const photosComplete =
    !photosNeeded || allFilled || canSkipPhotosForTesting() || photosReady;
  const canSubmit =
    photosComplete && Boolean(signatureDataUrl) && inspectionValid.ok;

  const tryContinueToPhotos = () => {
    if (!canContinueToPhotos(inspectionForm, powertrain, inspectionOptions)) {
      setShowPrecheckErrors(true);
      setPhase("inspect");
      window.setTimeout(() => {
        const invalid = document.querySelector<HTMLElement>(
          "[data-precheck-field].border-red-500, [data-precheck-field] .border-red-500, [data-precheck-field] .text-red-600"
        );
        invalid
          ?.closest("[data-precheck-field]")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }
    setShowPrecheckErrors(false);
    setPhase("photos");
  };

  const handleSubmit = useCallback(async () => {
    if (!draft || !vehicle) return;
    if (!user) {
      setSubmitError(CHECKOUT_ACCOUNT_MESSAGE);
      return;
    }
    if (isGenericDriverName(user.name)) {
      setSubmitError("Your signed-in name can't be a placeholder like Driver. Ask Office for a real name.");
      return;
    }
    if (!signatureDataUrl) {
      setSubmitError("Sign the report before submitting.");
      return;
    }
    if (!inspectionValid.ok) {
      setSubmitError(inspectionValid.error);
      setShowPrecheckErrors(true);
      setPhase("inspect");
      return;
    }
    if (isPrecheckRed(inspectionValid.form) === false) {
      const missing = required.filter((s) => !photos[s.angle]);
      if (missing.length && !canSkipPhotosForTesting() && !photosReady) {
        setSubmitError(
          `Finish the photo walkaround (${required.length - missing.length}/${required.length}).`
        );
        setPhase("photos");
        return;
      }
    }
    setSubmitting(true);
    setSubmitError("");
    setSavedOnPhone(false);
    setUploadProgress("Saving report…");
    try {
      const capturedAt = new Date().toISOString();
      const result = await submitCheckoutFromDraft({
        draftId: draft.id,
        companyId: draft.companyId,
        vehicleId: draft.vehicleId,
        unitNumber: vehicle.unitNumber,
        plate: vehicle.plate,
        year: Number(draft.year) || vehicle.year,
        make: draft.make || vehicle.make,
        model: draft.model || vehicle.model,
        odometer: Number(draft.odometer),
        driverName: user.name,
        dispatcherName: draft.dispatcherName,
        type: draft.type,
        inspectionForm: {
          ...inspectionValid.form,
          inspectedAt: capturedAt,
        },
        signatureDataUrl,
        signedAt: signedAt || capturedAt,
        photos,
        photoFlags,
        onProgress: (message, percent) => {
          setUploadProgress(message);
          setUploadPercent(percent);
          setUploadEstimate(message);
        },
      });
      if (result.state === "sent") setCompleted(result.report);
      else {
        setSavedOnPhone(true);
        if (result.error) setSubmitError(result.error);
      }
    } catch (err) {
      setSavedOnPhone(true);
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Saved on this phone. It will send when the signal is back."
      );
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  }, [
    user,
    draft,
    vehicle,
    photos,
    photoFlags,
    signatureDataUrl,
    signedAt,
    inspectionValid,
    required,
    photosReady,
  ]);

  if (loading || !draft || (!vehicle && !loadError)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="animate-pulse text-brand-600 font-semibold">
          Loading checkout…
        </p>
      </div>
    );
  }

  if (loadError || !vehicle) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Checkout" backHref="/checkout" />
        <p className="text-center text-red-600 px-4 py-12">
          {loadError || "Unit not found on the shared server."}
        </p>
      </div>
    );
  }

  if (savedOnPhone && !completed) {
    const needsSignIn = submitError.includes("Sign in first");
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Didn't finish uploading" backHref="/dashboard" />
        <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
          <div className="rounded-2xl border-2 border-amber-500 bg-amber-50 px-4 py-4 text-amber-950 space-y-3">
            <h2 className="text-xl font-bold">This check didn't finish uploading</h2>
            <p className="text-sm">
              {formatUnitLabel(vehicle.unitNumber, vehicle.plate)} — {draft.year} {draft.make}{" "}
              {draft.model}
            </p>
            <p className="text-sm leading-relaxed">
              {needsSignIn
                ? "It is still on this phone. Sign in, then retry. That will not create a second report."
                : "It is still on this phone, including any photos that are still waiting. Retry will not create a second report."}
            </p>
            {submitError && <p className="text-sm font-medium">{submitError}</p>}
            <Button size="lg" className="w-full" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? "Retrying…" : "Retry"}
            </Button>
          </div>
          <Button size="lg" variant="secondary" className="w-full" onClick={() => router.push("/my-checks")}>
            My recent checks
          </Button>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader
          title={completed.type === "check_in" ? "Check-in complete" : "Checkout complete"}
          backHref="/dashboard"
        />
        <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-5">
          <div className="bg-green-100 rounded-full p-6 inline-flex">
            <Check className="h-12 w-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Submitted</h2>
          <p className="text-gray-600">
            {formatUnitLabel(completed.unitNumber, completed.plate)} — {completed.year}{" "}
            {completed.make} {completed.model}
          </p>
          <p className="text-sm text-gray-500">
            Sent {formatDate(completed.sentAt || completed.completedAt)}. Office has
            this check. Slack is only a copy.
          </p>
          <div className="space-y-3 pt-2">
            <Button
              size="xl"
              className="w-full"
              onClick={() =>
                downloadCheckoutReportFile(completed, {
                  companyName: company?.name,
                  plate: completed.plate ?? vehicle.plate,
                })
              }
            >
              Download PDF for Slack
            </Button>
            <Button
              size="lg"
              className="w-full"
              onClick={() => router.push("/checkout")}
            >
              Start another report
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              onClick={() => router.push("/dashboard")}
            >
              Back to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-gray-50 flex flex-col ${
        phase === "photos" ? "checkout-photos-phase" : ""
      }`}
    >
      <AppHeader
        title={`${draft.type === "check_out" ? "Check out" : "Check in"} · ${formatUnitLabel(vehicle.unitNumber, vehicle.plate)}`}
        backHref="/checkout"
      />
      {!user && <CheckoutAccountBanner />}
      <div className="checkout-photos-content max-w-lg mx-auto px-4 py-4 flex-1 w-full space-y-4">
        <div className="checkout-unit-card bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-1">
          <p className="font-semibold text-gray-900">
            {company?.name ?? "Company"} · {formatUnitLabel(vehicle.unitNumber)}
          </p>
          <p className="text-gray-600">
            {draft.year} {draft.make} {draft.model} ·{" "}
            {Number(draft.odometer).toLocaleString()} mi
          </p>
          <p className="text-gray-500">
            Date {formatDateOnly(new Date().toISOString())}{" "}
            · {draft.driverName || user?.name || "Driver"}
            {draft.dispatcherName.trim() ? ` · Dispatcher ${draft.dispatcherName}` : ""}
          </p>
          <p className="text-gray-500">
            {UNIT_NUMBER_LABEL} {vehicle.unitNumber}
            {usesClover && cloverSerialOf(inspectionForm)
              ? ` · ${CLOVER_SERIAL_LABEL} ${cloverSerialOf(inspectionForm)}`
              : ""}
          </p>
          <p className="text-xs text-gray-500">
            {powertrain === "ev" ? "EV — oil/fuel N/A" : "Gas — oil/fuel required"}
          </p>
        </div>

        <div className="checkout-phase-tabs flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={phase === "inspect" ? "primary" : "secondary"}
            onClick={() => setPhase("inspect")}
          >
            1. Precheck
          </Button>
          <Button
            type="button"
            size="sm"
            variant={phase === "photos" ? "primary" : "secondary"}
            onClick={tryContinueToPhotos}
            disabled={redPark}
          >
            2. Photos
          </Button>
          <Button
            type="button"
            size="sm"
            variant={phase === "review" ? "primary" : "secondary"}
            onClick={() => {
              if (redPark) {
                if (canSubmit) setPhase("review");
                else setPhase("inspect");
                return;
              }
              if (!photosComplete || !signatureDataUrl) {
                tryContinueToPhotos();
                return;
              }
              setPhase("review");
            }}
          >
            3. Review
          </Button>
        </div>

        {phase === "review" ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-gray-900">Review before submit</h3>
                <p className="text-sm text-gray-600">
                  Check the header, precheck, photos, and signature. Nothing is sent until you submit.
                </p>
              </div>
            </div>
            <section className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Header</h4>
                <button
                  type="button"
                  className="text-sm font-semibold text-brand-700 underline"
                  onClick={() => router.push(`/checkout?draft=${draft.id}`)}
                >
                  Edit
                </button>
              </div>
              <p>{company?.name ?? "Company"} · {formatUnitLabel(vehicle.unitNumber, vehicle.plate)}</p>
              <p>{draft.year} {draft.make} {draft.model} · {Number(draft.odometer).toLocaleString()} mi</p>
              <p>
                {draft.type === "check_in" ? "Check in" : "Check out"} · {draft.driverName || user?.name || "Driver"}
                {draft.dispatcherName.trim() ? ` · Dispatcher ${draft.dispatcherName}` : ""}
              </p>
              <p>
                {formatDateOnly(new Date().toISOString())}
                {usesClover && cloverSerialOf(inspectionForm) ? ` · ${CLOVER_SERIAL_LABEL} ${cloverSerialOf(inspectionForm)}` : ""}
              </p>
            </section>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Precheck, tread, damage, flags</h4>
                <button type="button" className="text-sm font-semibold text-brand-700 underline" onClick={() => setPhase("inspect")}>
                  Edit
                </button>
              </div>
              <InspectionFormSummary
                form={inspectionForm}
                showClover={usesClover}
                hideResult
              />
            </section>
            {photosNeeded && (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Photos</h4>
                  <button type="button" className="text-sm font-semibold text-brand-700 underline" onClick={() => setPhase("photos")}>
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {steps.map((step) => (
                    <div key={step.angle} className="space-y-1">
                      {photos[step.angle] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photos[step.angle]} alt={step.label} className="h-20 w-full object-cover rounded-lg border border-gray-200" />
                      ) : (
                        <div className="h-20 rounded-lg border border-dashed border-gray-300 bg-gray-50" />
                      )}
                      <p className="text-[11px] text-gray-600 leading-tight">
                        {step.label}
                        {photoFlags[step.angle]?.flaggedDamage
                          ? `: ${photoFlags[step.angle]?.damageNote?.trim() || "damage"}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Signature</h4>
                <button
                  type="button"
                  className="text-sm font-semibold text-brand-700 underline"
                  onClick={() => setPhase(redPark ? "inspect" : "photos")}
                >
                  Edit
                </button>
              </div>
              {signatureDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatureDataUrl} alt={`Signature of ${draft.driverName || user?.name || "driver"}`} className="h-24 w-full object-contain bg-gray-50 rounded-lg border border-gray-200" />
              ) : (
                <p className="text-sm text-red-600">Signature is missing.</p>
              )}
            </section>
            {submitting && (
              <div>
                <div className="flex justify-between text-sm text-gray-700 mb-1">
                  <span>{uploadProgress || "Uploading"}</span>
                  <span>{uploadPercent}%</span>
                </div>
                <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-accent transition-all" style={{ width: `${uploadPercent}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">{uploadEstimate}</p>
              </div>
            )}
            {submitError && <p className="text-sm text-red-600 font-medium">{submitError}</p>}
            <Button size="xl" className="w-full" onClick={handleSubmit} disabled={submitting || !canSubmit}>
              {submitting ? uploadProgress || "Submitting…" : draft.type === "check_in" ? "Submit check-in" : "Submit checkout"}
            </Button>
          </div>
        ) : phase === "inspect" ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">Precheck</h3>
              <p className="text-sm text-gray-600">
                About a minute. If the vehicle is OK to drive, continue to the photo
                walkaround. Tire tread is answered on this form, not as its own
                photo. A red precheck parks the vehicle and skips photos.
              </p>
            </div>
            <InspectionFormFields
              form={inspectionForm}
              powertrain={powertrain}
              unitNumber={vehicle.unitNumber}
              onChange={setInspectionForm}
              showErrors={showPrecheckErrors}
              showClover={usesClover}
            />
            {redPark && inspectionValid.ok ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                  Park it. Photos are blocked. Sign below so Office gets the
                  repairs flag.
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Driver signature
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Signing as {draft.driverName || user?.name || "the signed-in driver"}
                  </p>
                </div>
                <SignaturePad
                  value={signatureDataUrl || undefined}
                  onSignature={(dataUrl) => {
                    setSignatureDataUrl(dataUrl);
                    setSignedAt(dataUrl ? new Date().toISOString() : "");
                  }}
                />
                {submitError && (
                  <p className="text-sm text-red-600 font-medium">{submitError}</p>
                )}
                <Button
                  size="xl"
                  className="w-full"
                  onClick={() => setPhase("review")}
                  disabled={!canSubmit}
                >
                  {!signatureDataUrl
                    ? "Sign above to review the park-it report"
                    : "Review park-it report"}
                </Button>
              </div>
            ) : (
              <Button
                size="xl"
                className="w-full"
                onClick={tryContinueToPhotos}
              >
                {canContinueToPhotos(inspectionForm, powertrain, inspectionOptions)
                  ? "Continue to photo walkaround"
                  : "Continue — fill required fields"}
              </Button>
            )}
          </div>
        ) : (
          <>
        <GuidedPhotoCapture
          photos={photos}
          photoFlags={photoFlags}
          steps={steps}
          testingBrowseMode={canSkipPhotosForTesting()}
          testingFinishLabel="Finish preview → Sign"
          allCompleteMessage="All photos accepted — sign below, then submit."
          onAccept={(angle, url) => {
            setPhotos((prev) => ({ ...prev, [angle]: url }));
          }}
          onClear={(angle) => {
            setPhotos((prev) => {
              const next = { ...prev };
              delete next[angle];
              return next;
            });
            setPhotoFlags((prev) => {
              const next = { ...prev };
              delete next[angle];
              return next;
            });
          }}
          onFlagDamage={(angle, flaggedDamage) => {
            setPhotoFlags((prev) => ({
              ...prev,
              [angle]: {
                flaggedDamage,
                damageNote: flaggedDamage ? prev[angle]?.damageNote : undefined,
              },
            }));
          }}
          onDamageNote={(angle, damageNote) => {
            setPhotoFlags((prev) => ({
              ...prev,
              [angle]: {
                flaggedDamage: true,
                damageNote,
                qualityNote: prev[angle]?.qualityNote,
              },
            }));
          }}
          onQualityNote={(angle, qualityNote) => {
            setPhotoFlags((prev) => ({
              ...prev,
              [angle]: {
                flaggedDamage: prev[angle]?.flaggedDamage ?? false,
                damageNote: prev[angle]?.damageNote,
                qualityNote,
              },
            }));
          }}
          onAllComplete={() => setPhotosReady(true)}
        />

        {canSkipPhotosForTesting() && !allFilled && (
          <Button
            type="button"
            variant="outline"
            size="md"
            className="checkout-photos-testing-extra w-full"
            onClick={() => {
              const filled: Partial<Record<PhotoAngle, string>> = {};
              for (const step of required) {
                filled[step.angle] = PHOTO_EXAMPLE_PATHS[step.angle];
              }
              setPhotos(filled);
              setPhotosReady(true);
            }}
          >
            Fill example photos (testing)
          </Button>
        )}

        {photosComplete && (
          <div className="checkout-photos-signature bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Driver signature
              </h3>
              <p className="text-sm text-gray-600">
                Required. Sign with your finger, then submit. Office sees this
                on the report and PDF.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Signing as {draft.driverName || user?.name || "the signed-in driver"}
              </p>
            </div>
            <SignaturePad
              value={signatureDataUrl || undefined}
              onSignature={(dataUrl) => {
                setSignatureDataUrl(dataUrl);
                setSignedAt(dataUrl ? new Date().toISOString() : "");
              }}
            />
          </div>
        )}

        {submitError && (
          <p className="text-sm text-red-600 font-medium">{submitError}</p>
        )}

        <div className="photo-step-submit-dock sticky bottom-0 -mx-4 px-4 pt-3 pb-6 safe-bottom bg-gray-50/95 border-t border-gray-200">
          <Button
            size="xl"
            className="w-full photo-step-submit-btn"
            onClick={() => setPhase("review")}
            disabled={submitting || !canSubmit}
          >
            {!inspectionValid.ok
                ? "Finish Precheck"
                : redPark
                  ? "Park it — go back to Precheck to sign"
                : !photosComplete
                ? `Review when ${required.filter((s) => photos[s.angle]).length}/${required.length} photos are filled`
                : !signatureDataUrl
                  ? "Sign above to review"
                  : "Review report"}
          </Button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutCapturePageWithSearch() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-brand-600">Loading...</div>
        </div>
      }
    >
      <CheckoutCapturePage />
    </Suspense>
  );
}
