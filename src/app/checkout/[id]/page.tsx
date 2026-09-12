"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { GuidedPhotoCapture } from "@/components/guided-photo-capture";
import { SignaturePad } from "@/components/signature-pad";
import { useAuth } from "@/hooks/use-auth";
import { canStartCheckout } from "@/lib/fleet-config";
import { canSkipPhotosForTesting } from "@/lib/dev-config";
import { getChecklistForCompany } from "@/lib/companies";
import {
  deleteCheckoutDraft,
  getCheckoutDraft,
  saveCheckoutDraft,
} from "@/lib/storage";
import {
  createCheckoutReport,
  fetchCompanies,
  fetchVehicles,
  SharedVehicle,
  uploadCheckoutPhoto,
} from "@/lib/checkout-api";
import {
  CheckoutDraft,
  CheckoutReport,
  Company,
  PhotoAngle,
} from "@/lib/types";
import {
  checkoutReportPdfFilename,
  downloadPDF,
  generateCheckoutReportPDF,
} from "@/lib/pdf";
import {
  applyPowertrainToForm,
  createEmptyInspectionForm,
  inferPowertrain,
  validateInspectionForm,
} from "@/lib/inspection-form";
import { formatDate, formatDateOnly, formatUnitLabel } from "@/lib/utils";
import { PHOTO_EXAMPLE_PATHS } from "@/lib/photo-examples";
import { InspectionFormFields } from "@/components/inspection-form-fields";
import { Check } from "lucide-react";

export default function CheckoutCapturePage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const draftId = params.id as string;

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
  const [submitError, setSubmitError] = useState("");
  const [completed, setCompleted] = useState<CheckoutReport | null>(null);
  const [photosReady, setPhotosReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [inspectionForm, setInspectionForm] = useState(() =>
    createEmptyInspectionForm("gas")
  );
  const [phase, setPhase] = useState<"inspect" | "photos">("inspect");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canStartCheckout(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

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
      const formOk = validateInspectionForm(form, powertrain).ok;
      setPhase(formOk ? "photos" : "inspect");
      try {
        const [vehicles, companies] = await Promise.all([
          fetchVehicles(d.companyId, { includeArchived: true }),
          fetchCompanies(),
        ]);
        const found = vehicles.find((item) => item.id === d.vehicleId) ?? null;
        setVehicle(found);
        if (found?.archivedAt) {
          setLoadError(
            "This unit is archived / out of service. Ask Office to unarchive it before submitting a new checkout."
          );
        }
        setCompany(companies.find((item) => item.id === d.companyId) ?? null);
      } catch (err) {
        setLoadError(
          err instanceof Error
            ? err.message
            : "Could not load this unit from the shared server."
        );
      }
    }
    load();
  }, [draftId, router]);

  useEffect(() => {
    if (!draft || !vehicle) return;
    const next = inferPowertrain(draft.make, draft.model, vehicle.powertrain);
    setInspectionForm((prev) => {
      const cloverNumber = prev.cloverNumber || vehicle.unitNumber;
      const synced = applyPowertrainToForm(
        { ...prev, cloverNumber },
        next
      );
      return synced;
    });
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
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, photos, photoFlags, inspectionForm, signatureDataUrl, signedAt]);

  const steps = getChecklistForCompany(company);
  const required = steps.filter((s) => s.required);
  const allFilled = required.every((s) => photos[s.angle]);
  const photosComplete =
    allFilled || canSkipPhotosForTesting() || photosReady;
  const powertrain = inferPowertrain(
    draft?.make,
    draft?.model,
    vehicle?.powertrain || inspectionForm.powertrain
  );
  const inspectionValid = validateInspectionForm(inspectionForm, powertrain);
  const canSubmit =
    photosComplete && Boolean(signatureDataUrl) && inspectionValid.ok;

  const handleSubmit = useCallback(async () => {
    if (!user || !draft || !vehicle) return;
    if (!signatureDataUrl) {
      setSubmitError("Sign the report before submitting.");
      return;
    }
    if (!inspectionValid.ok) {
      setSubmitError(inspectionValid.error);
      setPhase("inspect");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    setUploadProgress("Saving report…");
    try {
      const capturedAt = new Date().toISOString();
      let report = await createCheckoutReport({
        companyId: draft.companyId,
        vehicleId: draft.vehicleId,
        unitNumber: vehicle.unitNumber,
        plate: vehicle.plate,
        year: Number(draft.year) || vehicle.year,
        make: draft.make || vehicle.make,
        model: draft.model || vehicle.model,
        odometer: Number(draft.odometer),
        driverName: draft.driverName,
        dispatcherName: draft.dispatcherName,
        type: draft.type,
        inspectionForm: {
          ...inspectionValid.form,
          cloverNumber:
            inspectionValid.form.cloverNumber || vehicle.unitNumber,
          inspectedAt: inspectionValid.form.inspectedAt || capturedAt,
        },
        signatureDataUrl,
        signedAt: signedAt || capturedAt,
      });

      const entries = Object.entries(photos).filter(([, dataUrl]) => dataUrl) as [
        PhotoAngle,
        string,
      ][];
      for (let i = 0; i < entries.length; i += 1) {
        const [angle, dataUrl] = entries[i];
        setUploadProgress(`Uploading photos ${i + 1}/${entries.length}…`);
        report = await uploadCheckoutPhoto(report.id, angle, dataUrl, capturedAt, {
          flaggedDamage: photoFlags[angle]?.flaggedDamage,
          damageNote: photoFlags[angle]?.damageNote,
        });
      }

      await deleteCheckoutDraft(draft.id);
      setCompleted(report);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Could not save to the shared server. Check your connection and try again."
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
  ]);

  if (loading || !user || !draft || (!vehicle && !loadError)) {
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

  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Checkout complete" backHref="/dashboard" />
        <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-5">
          <div className="bg-green-100 rounded-full p-6 inline-flex">
            <Check className="h-12 w-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Checkout report complete
          </h2>
          <p className="text-gray-600">
            {formatUnitLabel(completed.unitNumber, completed.plate)} — {completed.year}{" "}
            {completed.make} {completed.model}
          </p>
          <p className="text-sm text-gray-500">
            Saved to Office {formatDate(completed.completedAt)} · pending review.
            Slack is only a copy — Office is the record.
          </p>
          <div className="space-y-3 pt-2">
            <Button
              size="xl"
              className="w-full"
              onClick={async () => {
                const blob = await generateCheckoutReportPDF(completed);
                downloadPDF(blob, checkoutReportPdfFilename(completed));
              }}
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader
        title={`${draft.type === "check_out" ? "Check out" : "Check in"} · ${formatUnitLabel(vehicle.unitNumber, vehicle.plate)}`}
        backHref="/checkout"
      />
      <div className="max-w-lg mx-auto px-4 py-4 flex-1 w-full space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 text-sm space-y-1">
          <p className="font-semibold text-gray-900">
            {company?.name ?? "Company"} · {formatUnitLabel(vehicle.unitNumber)}
          </p>
          <p className="text-gray-600">
            {draft.year} {draft.make} {draft.model} ·{" "}
            {Number(draft.odometer).toLocaleString()} mi
          </p>
          <p className="text-gray-500">
            Date {formatDateOnly(inspectionForm.inspectedAt || new Date().toISOString())}{" "}
            · {draft.driverName} · Dispatcher {draft.dispatcherName}
          </p>
          <p className="text-xs text-gray-500">
            {powertrain === "ev" ? "EV — oil/fuel N/A" : "Gas — oil/fuel required"}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={phase === "inspect" ? "primary" : "secondary"}
            onClick={() => setPhase("inspect")}
          >
            1. Inspection form
          </Button>
          <Button
            type="button"
            size="sm"
            variant={phase === "photos" ? "primary" : "secondary"}
            onClick={() => {
              if (!inspectionValid.ok) return;
              setPhase("photos");
            }}
            disabled={!inspectionValid.ok}
          >
            2. Photo walkaround
          </Button>
        </div>

        {phase === "inspect" ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Paper inspection form
              </h3>
              <p className="text-sm text-gray-600">
                Digitized from the Rad Cab sheet. The 30-photo walkaround is
                next — this does not replace it.
              </p>
            </div>
            <InspectionFormFields
              form={inspectionForm}
              powertrain={powertrain}
              onChange={setInspectionForm}
            />
            <Button
              size="xl"
              className="w-full"
              disabled={!inspectionValid.ok}
              onClick={() => setPhase("photos")}
            >
              {inspectionValid.ok
                ? "Continue to photo walkaround"
                : "Finish the checklist to continue"}
            </Button>
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
              [angle]: { flaggedDamage, damageNote: prev[angle]?.damageNote },
            }));
          }}
          onAllComplete={() => setPhotosReady(true)}
        />

        {canSkipPhotosForTesting() && !allFilled && (
          <Button
            type="button"
            variant="outline"
            size="md"
            className="w-full"
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
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Driver signature
              </h3>
              <p className="text-sm text-gray-600">
                Required. Sign with your finger, then submit. Office sees this
                on the report and PDF.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Signing as {draft.driverName}
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

        <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-6 safe-bottom bg-gray-50/95 border-t border-gray-200">
          <Button
            size="xl"
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
          >
            {submitting
              ? uploadProgress || "Saving…"
              : !inspectionValid.ok
                ? "Finish the inspection form"
                : !photosComplete
                ? `Submit when ${required.filter((s) => photos[s.angle]).length}/${required.length} photos are filled`
                : !signatureDataUrl
                  ? "Sign above to submit"
                  : "Submit complete report"}
          </Button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
