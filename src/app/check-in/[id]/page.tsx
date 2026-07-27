"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { GuidedPhotoCapture } from "@/components/guided-photo-capture";
import { DamageMaintenanceReport } from "@/components/damage-maintenance-report";
import { SignaturePad } from "@/components/signature-pad";
import { VoiceInput } from "@/components/voice-input";
import { useAuth } from "@/hooks/use-auth";
import {
  getVehicleById,
  getFleetById,
  saveCheck,
  saveVehicle,
  draftId,
  saveCheckInDraft,
  getCheckInDraft,
  deleteCheckInDraft,
} from "@/lib/storage";
import { getFleetConfig, canOverride, canPerformCheckIn } from "@/lib/fleet-config";
import { canSkipPhotosForTesting, shouldAutoSkipPhotos } from "@/lib/dev-config";
import { dispatchAlertsFromCheck } from "@/lib/alerts";
import { generateId, fileToDataUrl, formatDate } from "@/lib/utils";
import { generateCheckPDF, downloadPDF } from "@/lib/pdf";
import {
  Vehicle,
  Fleet,
  CheckRecord,
  CheckType,
  PhotoAngle,
  VehiclePhoto,
  MaintenanceIssue,
  ConditionRating,
  TowEquipmentCheck,
  PHOTO_ANGLES,
  MAINTENANCE_ISSUES,
  KnownIssueConsent,
  FuelLevel,
  FUEL_LEVEL_LABELS,
} from "@/lib/types";
import { Check, ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  hasOpenKnownIssue,
  peekKnownIssueConsent,
  storeKnownIssueConsent,
} from "@/lib/known-issue";
import { resolveStatusAfterCheck } from "@/lib/vehicle-status";
import { KnownIssueConsentScreen } from "@/components/known-issue-consent-screen";
import { FuelLevelPicker } from "@/components/fuel-level-picker";
import { OilChangeStatusBadge } from "@/components/oil-change-status";
import { CheckOutBlockScreen } from "@/components/check-out-block-screen";
import {
  getCheckOutBlockReason,
  getCheckOutOilWarning,
  estimateCheckOutMileage,
} from "@/lib/oil-change";
import { getReturnHref } from "@/lib/nav-return";

const STEPS = [
  "Take Photos",
  "Enter Mileage",
  "Fuel Level",
  "Damage & Maintenance",
  "Extras",
  "Rate Condition",
  "Sign Here",
  "Review",
];

function CheckInWorkflow() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const vehicleId = params.id as string;
  const checkType = (searchParams.get("type") || "check_in") as CheckType;
  const checkInBackHref = getReturnHref("/check-in");

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [savedCheck, setSavedCheck] = useState<CheckRecord | null>(null);

  // Form state
  const [photos, setPhotos] = useState<Partial<Record<PhotoAngle, string>>>({});
  const [startOdometer, setStartOdometer] = useState("");
  const [endOdometer, setEndOdometer] = useState("");
  const [issues, setIssues] = useState<MaintenanceIssue[]>([]);
  const [maintenanceNotes, setMaintenanceNotes] = useState("");
  const [fuelReceipt, setFuelReceipt] = useState("");
  const [towCheck, setTowCheck] = useState<TowEquipmentCheck>({
    winchOperational: false,
    chainsSecure: false,
    lightsWorking: false,
    hydraulicFluidOk: false,
    notes: "",
  });
  const [condition, setCondition] = useState<ConditionRating>("good");
  const [signature, setSignature] = useState("");
  const [notes, setNotes] = useState("");
  const [fuelLevel, setFuelLevel] = useState<FuelLevel | "">("");
  const [overrideReason, setOverrideReason] = useState("");
  const [photosSkippedForTesting, setPhotosSkippedForTesting] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [knownIssueConsent, setKnownIssueConsent] =
    useState<KnownIssueConsent | null>(null);
  const [consentResolved, setConsentResolved] = useState(false);

  useEffect(() => {
    if (shouldAutoSkipPhotos()) {
      setPhotosSkippedForTesting(true);
      setStep(1);
    }
  }, []);

  useEffect(() => {
    if (user && !canPerformCheckIn(user.role)) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    async function load() {
      const v = await getVehicleById(vehicleId);
      if (v) {
        setVehicle(v);
        const f = await getFleetById(v.fleetId);
        if (f) setFleet(f);

        if (user) {
          const id = draftId(vehicleId, checkType, user.id);
          const draft = await getCheckInDraft(id);
          const hasDraft =
            draft &&
            (draft.step > 0 ||
              Object.keys(draft.photos).length > 0 ||
              draft.signature ||
              draft.startOdometer ||
              draft.endOdometer);
          if (hasDraft) {
            setShowDraftBanner(true);
          } else if (checkType === "check_in") {
            setStartOdometer(v.lastMileage?.toString() || "");
          }
        } else if (checkType === "check_in") {
          setStartOdometer(v.lastMileage?.toString() || "");
        }
      }
      setDraftLoaded(true);
    }

    load();
  }, [vehicleId, checkType, user]);

  useEffect(() => {
    if (!vehicle || consentResolved) return;
    if (!hasOpenKnownIssue(vehicle)) {
      setConsentResolved(true);
      return;
    }
    const stored = peekKnownIssueConsent(vehicleId, checkType);
    if (stored) {
      setKnownIssueConsent(stored);
      setConsentResolved(true);
    }
  }, [vehicle, vehicleId, checkType, consentResolved]);

  const handleWorkflowConsent = () => {
    if (!vehicle || !user) return;
    const consent: KnownIssueConsent = {
      issueText: vehicle.knownIssue!.text.trim(),
      driverName: user.name,
      consentedAt: new Date().toISOString(),
    };
    setKnownIssueConsent(consent);
    storeKnownIssueConsent(vehicleId, checkType, consent);
    setConsentResolved(true);
  };

  useEffect(() => {
    if (!user || !vehicle || !draftLoaded || completed) return;

    const id = draftId(vehicleId, checkType, user.id);
    const hasProgress =
      step > 0 ||
      Object.keys(photos).length > 0 ||
      startOdometer ||
      endOdometer ||
      issues.length > 0 ||
      signature;

    if (!hasProgress) return;

    const timer = setTimeout(() => {
      void saveCheckInDraft({
        id,
        vehicleId,
        checkType,
        driverId: user.id,
        step,
        photos,
        startOdometer,
        endOdometer,
        issues,
        maintenanceNotes,
        fuelReceipt,
        fuelLevel,
        towCheck,
        condition,
        signature,
        notes,
        updatedAt: new Date().toISOString(),
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [
    user,
    vehicle,
    vehicleId,
    checkType,
    step,
    photos,
    startOdometer,
    endOdometer,
    issues,
    maintenanceNotes,
    fuelReceipt,
    fuelLevel,
    towCheck,
    condition,
    signature,
    notes,
    draftLoaded,
    completed,
  ]);

  const resumeDraft = async () => {
    if (!user) return;
    const draft = await getCheckInDraft(draftId(vehicleId, checkType, user.id));
    if (draft) {
      setStep(draft.step);
      setPhotos(draft.photos);
      setStartOdometer(draft.startOdometer);
      setEndOdometer(draft.endOdometer);
      setIssues(draft.issues);
      setMaintenanceNotes(draft.maintenanceNotes);
      setFuelReceipt(draft.fuelReceipt);
      setFuelLevel(draft.fuelLevel ?? "");
      setTowCheck(draft.towCheck);
      setCondition(draft.condition);
      setSignature(draft.signature);
      setNotes(draft.notes);
    }
    setShowDraftBanner(false);
  };

  const discardDraft = async () => {
    if (!user) return;
    await deleteCheckInDraft(draftId(vehicleId, checkType, user.id));
    setShowDraftBanner(false);
    if (vehicle && checkType === "check_in") {
      setStartOdometer(vehicle.lastMileage?.toString() || "");
    }
  };

  const towCheckComplete =
    towCheck.winchOperational &&
    towCheck.chainsSecure &&
    towCheck.lightsWorking &&
    towCheck.hydraulicFluidOk;

  const requiredPhotos = PHOTO_ANGLES.filter((p) => p.required);
  const allPhotosCaptured = requiredPhotos.every((p) => photos[p.angle]);
  const showTowCheck = fleet ? getFleetConfig(fleet.type).requiresTowEquipmentCheck : false;

  const toggleIssue = (issue: MaintenanceIssue) => {
    setIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue]
    );
  };

  const checkoutMileage =
    checkType === "check_out" && vehicle
      ? endOdometer.trim() && !isNaN(Number(endOdometer))
        ? Number(endOdometer)
        : estimateCheckOutMileage(vehicle)
      : 0;

  const checkOutBlockReason =
    vehicle && checkType === "check_out"
      ? getCheckOutBlockReason(vehicle, checkoutMileage)
      : null;

  const checkOutOilWarning =
    vehicle && checkType === "check_out"
      ? getCheckOutOilWarning(vehicle, checkoutMileage)
      : null;

  const initialCheckOutBlocked =
    vehicle &&
    checkType === "check_out" &&
    getCheckOutBlockReason(vehicle, estimateCheckOutMileage(vehicle));

  const canProceed = useCallback(() => {
    switch (step) {
      case 0:
        return (
          allPhotosCaptured ||
          photosSkippedForTesting ||
          canSkipPhotosForTesting()
        );
      case 1: {
        if (checkType === "check_out") {
          const endValid = endOdometer.trim() !== "" && !isNaN(Number(endOdometer));
          const last = vehicle?.lastMileage;
          if (!endValid) return false;
          if (last != null && Number(endOdometer) < last) return false;
          if (
            vehicle &&
            getCheckOutBlockReason(vehicle, Number(endOdometer))
          ) {
            return false;
          }
          return true;
        }
        return startOdometer.trim() !== "" && !isNaN(Number(startOdometer));
      }
      case 2:
        return fuelLevel !== "";
      case 3:
        return true;
      case 4:
        if (showTowCheck && !(towCheckComplete || (user && canOverride(user.role)))) {
          return false;
        }
        return true;
      case 5:
        return condition !== undefined;
      case 6:
        return signature.length > 0;
      case 7:
        return true;
      default:
        return false;
    }
  }, [step, allPhotosCaptured, photosSkippedForTesting, startOdometer, endOdometer, checkType, condition, signature, showTowCheck, towCheckComplete, user, vehicle, fuelLevel]);

  const handleSubmit = async () => {
    if (!user || !vehicle || !fleet) return;
    setSubmitting(true);

    const photoRecords: VehiclePhoto[] = Object.entries(photos)
      .filter(([, dataUrl]) => dataUrl)
      .map(([angle, dataUrl]) => ({
        angle: angle as PhotoAngle,
        dataUrl: dataUrl!,
        capturedAt: new Date().toISOString(),
      }));

    const checkStartOdometer =
      checkType === "check_out"
        ? (vehicle.lastMileage ?? Number(endOdometer))
        : Number(startOdometer);
    const checkEndOdometer =
      checkType === "check_out" ? Number(endOdometer) : undefined;

    const check: CheckRecord = {
      id: generateId(),
      vehicleId: vehicle.id,
      fleetId: fleet.id,
      driverId: user.id,
      driverName: user.name,
      type: checkType,
      photos: photoRecords,
      startOdometer: checkStartOdometer,
      endOdometer: checkEndOdometer,
      maintenanceIssues: issues,
      maintenanceNotes: maintenanceNotes || undefined,
      fuelReceiptUrl: fuelReceipt || undefined,
      fuelLevel: fuelLevel as FuelLevel,
      towEquipmentCheck: showTowCheck ? towCheck : undefined,
      conditionRating: condition,
      signatureDataUrl: signature,
      notes: notes || undefined,
      overrideBy: overrideReason && canOverride(user.role) ? user.name : undefined,
      overrideReason: overrideReason || undefined,
      knownIssueConsent: knownIssueConsent || undefined,
      synced: navigator.onLine,
      createdAt: new Date().toISOString(),
    };

    await saveCheck(check);

    const mileage =
      checkType === "check_out" ? Number(endOdometer) : Number(startOdometer);
    const newStatus = resolveStatusAfterCheck(
      vehicle,
      checkType,
      issues,
      condition
    );

    const previousStatus = vehicle.status;
    const updatedVehicle: Vehicle = {
      ...vehicle,
      lastMileage: mileage,
      status: newStatus,
    };
    await saveVehicle(updatedVehicle);

    await dispatchAlertsFromCheck(check, updatedVehicle, fleet, previousStatus);

    if (user) {
      await deleteCheckInDraft(draftId(vehicleId, checkType, user.id));
    }

    setSavedCheck(check);
    setCompleted(true);
    setSubmitting(false);
  };

  const handleDownloadPDF = async () => {
    if (!savedCheck || !vehicle || !fleet) return;
    const blob = await generateCheckPDF(savedCheck, vehicle, fleet);
    downloadPDF(blob, `fleetcheck-${vehicle.plate}-${Date.now()}.pdf`);
  };

  if (!vehicle || !fleet) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-brand-600">Loading vehicle...</div>
      </div>
    );
  }

  if (hasOpenKnownIssue(vehicle) && !consentResolved && user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Known Issue" backHref={checkInBackHref} />
        <div className="max-w-lg mx-auto px-4 py-6">
          <KnownIssueConsentScreen
            vehicle={vehicle}
            checkType={checkType}
            issueText={vehicle.knownIssue!.text.trim()}
            onConsent={handleWorkflowConsent}
            onCancel={() => router.push(checkInBackHref)}
          />
        </div>
      </div>
    );
  }

  if (initialCheckOutBlocked) {
    return (
      <CheckOutBlockScreen
        message={initialCheckOutBlocked}
        backHref={checkInBackHref}
      />
    );
  }

  if (completed && savedCheck) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Complete" backHref="/dashboard" />
        <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-6">
          <div className="bg-green-100 rounded-full p-6 inline-flex">
            <Check className="h-12 w-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            {checkType === "check_in" ? "Check In" : "Check Out"} Complete
          </h2>
          <p className="text-gray-600">
            {vehicle.plate} — {vehicle.year} {vehicle.make} {vehicle.model}
          </p>
          <div className="space-y-3">
            <Button size="xl" className="w-full" onClick={handleDownloadPDF}>
              <Download className="h-5 w-5 mr-2" />
              Download PDF Report
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="w-full"
              onClick={() => router.push("/dashboard")}
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader
        title={`${checkType === "check_in" ? "Check In" : "Check Out"} — ${vehicle.plate}`}
        backHref={checkInBackHref}
      />

      <div className="max-w-lg mx-auto px-4 py-4 flex-1 flex flex-col w-full">
        {showDraftBanner && (
          <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-brand-900">
              You have a saved check-in for this vehicle
            </p>
            <p className="text-sm text-brand-700">
              Resume where you left off, or start fresh.
            </p>
            <div className="flex gap-2">
              <Button size="md" className="flex-1" onClick={resumeDraft}>
                Resume
              </Button>
              <Button
                size="md"
                variant="secondary"
                className="flex-1"
                onClick={discardDraft}
              >
                Start Fresh
              </Button>
            </div>
          </div>
        )}

        <ProgressBar
          current={step + 1}
          total={STEPS.length}
          label={STEPS[step]}
          className="mb-4"
        />

        {checkType === "check_out" && vehicle.lastMileage != null && (
          <div className="mb-4">
            <OilChangeStatusBadge
              vehicle={vehicle}
              currentMileage={checkoutMileage}
              compact
            />
          </div>
        )}

        <div className="flex-1">
          {/* Step 0: Photos */}
          {step === 0 && (
            <GuidedPhotoCapture
              photos={photos}
              testingBrowseMode={canSkipPhotosForTesting()}
              onAccept={(angle, url) => {
                setPhotos((prev) => ({ ...prev, [angle]: url }));
              }}
              onClear={(angle) => {
                setPhotos((prev) => {
                  const next = { ...prev };
                  delete next[angle];
                  return next;
                });
              }}
              onAllComplete={() => {
                if (canSkipPhotosForTesting()) {
                  setPhotosSkippedForTesting(true);
                }
                setStep(1);
              }}
            />
          )}

          {/* Step 1: Mileage */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-gray-900">Enter Mileage</h2>
                <p className="text-base text-gray-600 mt-1">
                  {checkType === "check_out"
                    ? "Enter the odometer reading when you finish."
                    : "Enter the odometer reading when you start."}
                </p>
              </div>

              {checkType === "check_in" ? (
                <Input
                  label="Start Odometer"
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 45230"
                  value={startOdometer}
                  onChange={(e) => setStartOdometer(e.target.value)}
                  hint="Mileage at the start of your shift"
                />
              ) : (
                <>
                  {vehicle.lastMileage != null && (
                    <div className="bg-gray-100 rounded-xl p-4 text-center">
                      <p className="text-sm text-gray-600">Mileage at check-in</p>
                      <p className="text-xl font-bold text-gray-900">
                        {vehicle.lastMileage.toLocaleString()} mi
                      </p>
                    </div>
                  )}
                  <Input
                    label="End Odometer"
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 45310"
                    value={endOdometer}
                    onChange={(e) => setEndOdometer(e.target.value)}
                    hint="Mileage at the end of your shift"
                  />
                  {endOdometer &&
                    vehicle.lastMileage != null &&
                    Number(endOdometer) >= vehicle.lastMileage && (
                      <div className="bg-brand-50 rounded-xl p-4 text-center">
                        <p className="text-sm text-gray-600">Distance driven</p>
                        <p className="text-2xl font-bold text-brand-700">
                          {(Number(endOdometer) - vehicle.lastMileage).toLocaleString()}{" "}
                          miles
                        </p>
                      </div>
                    )}
                  {endOdometer &&
                    vehicle.lastMileage != null &&
                    Number(endOdometer) < vehicle.lastMileage && (
                      <p className="text-red-600 text-sm text-center font-medium">
                        End mileage must be equal to or greater than check-in mileage.
                      </p>
                    )}
                  {checkOutOilWarning && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 font-medium">
                      {checkOutOilWarning}
                    </div>
                  )}
                  {checkOutBlockReason && endOdometer && (
                    <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 font-medium">
                      {checkOutBlockReason}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 2: Fuel Level */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-gray-900">Fuel Level</h2>
                <p className="text-base text-gray-600 mt-1">
                  Record the fuel gauge reading (photo was captured in the photo step).
                </p>
              </div>
              <FuelLevelPicker
                value={fuelLevel}
                onChange={setFuelLevel}
                required
              />
            </div>
          )}

          {/* Step 3: Damage & Maintenance */}
          {step === 3 && (
            <DamageMaintenanceReport
              selected={issues}
              onToggle={toggleIssue}
              onClearAll={() => {
                setIssues([]);
                setMaintenanceNotes("");
              }}
              notes={maintenanceNotes}
              onNotesChange={setMaintenanceNotes}
              priorityIds={
                fleet ? getFleetConfig(fleet.type).maintenancePriority : []
              }
            />
          )}

          {/* Step 4: Extras */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Fuel Receipt (optional)
                </p>
                <label className="block w-full p-6 rounded-xl border-2 border-dashed border-gray-300 text-center cursor-pointer hover:border-brand-400">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setFuelReceipt(await fileToDataUrl(file));
                    }}
                  />
                  {fuelReceipt ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fuelReceipt}
                      alt="Fuel receipt"
                      className="max-h-32 mx-auto rounded"
                    />
                  ) : (
                    <p className="text-sm text-gray-500">Tap to upload receipt</p>
                  )}
                </label>
              </div>

              {showTowCheck && (
                <div>
                  <p className="text-base font-bold text-gray-900 mb-1">
                    Tow Truck Equipment Check
                  </p>
                  <p className="text-sm text-gray-600 mb-3">
                    All items must be checked before continuing.
                  </p>
                  <div className="space-y-3">
                    {(
                      [
                        ["winchOperational", "Winch Operational"],
                        ["chainsSecure", "Chains Secure"],
                        ["lightsWorking", "Lights Working"],
                        ["hydraulicFluidOk", "Hydraulic Fluid OK"],
                      ] as const
                    ).map(([key, label]) => (
                      <label
                        key={key}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer min-h-[56px] ${
                          towCheck[key]
                            ? "border-brand-600 bg-brand-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={towCheck[key]}
                          onChange={(e) =>
                            setTowCheck((prev) => ({
                              ...prev,
                              [key]: e.target.checked,
                            }))
                          }
                          className="h-6 w-6 rounded border-gray-300 text-brand-600"
                        />
                        <span className="text-base font-medium">{label}</span>
                      </label>
                    ))}
                  </div>
                  {!towCheckComplete && (
                    <p className="text-sm text-orange-600 mt-2 font-medium">
                      Check all four items to continue (Super Admin can override on review).
                    </p>
                  )}
                </div>
              )}

              <p className="text-sm font-medium text-gray-700 mb-2">
                Notes / Incident (optional)
              </p>
              <VoiceInput
                value={notes}
                onChange={setNotes}
                placeholder="Describe damage, incidents, or other notes..."
              />
            </div>
          )}

          {/* Step 5: Condition */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-gray-900">How Does It Look?</h2>
                <p className="text-base text-gray-600 mt-1">
                  Pick the overall condition of the vehicle.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {(["good", "fair", "poor"] as ConditionRating[]).map((rating) => (
                  <button
                    key={rating}
                    onClick={() => setCondition(rating)}
                    className={`p-5 rounded-2xl border-2 text-left flex items-center gap-4 transition-colors min-h-[72px] ${
                      condition === rating
                        ? rating === "good"
                          ? "border-green-500 bg-green-50"
                          : rating === "fair"
                          ? "border-yellow-500 bg-yellow-50"
                          : "border-red-500 bg-red-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <span className="text-4xl">
                      {rating === "good" ? "👍" : rating === "fair" ? "👌" : "👎"}
                    </span>
                    <div>
                      <span className="text-lg font-bold capitalize block">{rating}</span>
                      <span className="text-sm text-gray-600">
                        {rating === "good"
                          ? "No issues noticed"
                          : rating === "fair"
                          ? "Minor wear or small issues"
                          : "Needs attention soon"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 6: Signature */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-gray-900">Sign to Confirm</h2>
                <p className="text-base text-gray-600 mt-1">
                  Your signature confirms this check is accurate.
                </p>
              </div>
              <SignaturePad value={signature} onSignature={setSignature} />
            </div>
          )}

          {/* Step 7: Review */}
          {step === 7 && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Vehicle</span>
                  <span className="font-medium">
                    {vehicle.plate} — {vehicle.make} {vehicle.model}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className="font-medium capitalize">
                    {checkType.replace("_", " ")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Odometer</span>
                  <span className="font-medium">
                    {checkType === "check_in"
                      ? `${Number(startOdometer).toLocaleString()} mi`
                      : vehicle.lastMileage != null
                      ? `${vehicle.lastMileage.toLocaleString()} → ${Number(endOdometer).toLocaleString()} mi`
                      : `${Number(endOdometer).toLocaleString()} mi`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Fuel</span>
                  <span className="font-medium">
                    {fuelLevel ? FUEL_LEVEL_LABELS[fuelLevel as FuelLevel] : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Photos</span>
                  <span className="font-medium">
                    {photosSkippedForTesting
                      ? "Skipped (testing)"
                      : `${Object.keys(photos).length} accepted`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Damage / Maintenance</span>
                  <span className="font-medium text-right max-w-[55%]">
                    {issues.length > 0
                      ? issues
                          .map(
                            (i) =>
                              MAINTENANCE_ISSUES.find((m) => m.id === i)?.label
                          )
                          .filter(Boolean)
                          .join(", ")
                      : "None reported"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Condition</span>
                  <span className="font-medium capitalize">{condition}</span>
                </div>
                {knownIssueConsent && (
                  <div className="pt-2 border-t border-gray-100 space-y-1">
                    <p className="text-xs font-semibold text-amber-800 uppercase">
                      Known Issue Consent
                    </p>
                    <p className="text-sm text-gray-700">{knownIssueConsent.issueText}</p>
                    <p className="text-xs text-gray-500">
                      {knownIssueConsent.driverName} ·{" "}
                      {formatDate(knownIssueConsent.consentedAt)}
                    </p>
                  </div>
                )}
              </div>

              {user && canOverride(user.role) && (
                <VoiceInput
                  value={overrideReason}
                  onChange={setOverrideReason}
                  placeholder="Override reason (Super Admin only, optional)..."
                  rows={2}
                />
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3 pt-6 pb-4 safe-bottom">
          {step > 0 && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setStep(step - 1)}
              className="flex-1"
            >
              <ChevronLeft className="h-5 w-5 mr-1" />
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              size="xl"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex-1"
            >
              Next
              <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          ) : (
            <Button
              size="xl"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? "Saving..." : "Finish Check"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CheckInVehiclePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-brand-600">Loading...</div>
        </div>
      }
    >
      <CheckInWorkflow />
    </Suspense>
  );
}
