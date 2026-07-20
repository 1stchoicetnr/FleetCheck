"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { GuidedPhotoCapture } from "@/components/guided-photo-capture";
import { SignaturePad } from "@/components/signature-pad";
import { VoiceInput } from "@/components/voice-input";
import { useAuth } from "@/hooks/use-auth";
import {
  getVehicleById,
  getFleetById,
  saveCheck,
  saveVehicle,
  updateVehicleStatus,
} from "@/lib/storage";
import { getFleetConfig, canOverride } from "@/lib/fleet-config";
import { processCheckNotifications } from "@/lib/notifications";
import { generateId, fileToDataUrl } from "@/lib/utils";
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
} from "@/lib/types";
import { Check, ChevronLeft, ChevronRight, Download } from "lucide-react";

const STEPS = [
  "Take Photos",
  "Enter Mileage",
  "Report Issues",
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

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [savedCheck, setSavedCheck] = useState<CheckRecord | null>(null);

  // Form state
  const [photos, setPhotos] = useState<Partial<Record<PhotoAngle, string>>>({});
  const [photoIndex, setPhotoIndex] = useState(0);
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
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    async function load() {
      const v = await getVehicleById(vehicleId);
      if (v) {
        setVehicle(v);
        setStartOdometer(v.lastMileage?.toString() || "");
        const f = await getFleetById(v.fleetId);
        if (f) setFleet(f);
      }
    }
    load();
  }, [vehicleId]);

  const requiredPhotos = PHOTO_ANGLES.filter((p) => p.required);
  const allPhotosCaptured = requiredPhotos.every((p) => photos[p.angle]);
  const showTowCheck = fleet ? getFleetConfig(fleet.type).requiresTowEquipmentCheck : false;

  const toggleIssue = (issue: MaintenanceIssue) => {
    setIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue]
    );
  };

  const canProceed = useCallback(() => {
    switch (step) {
      case 0:
        return allPhotosCaptured;
      case 1: {
        const startValid = startOdometer.trim() !== "" && !isNaN(Number(startOdometer));
        if (checkType === "check_out") {
          const endValid = endOdometer.trim() !== "" && !isNaN(Number(endOdometer));
          return startValid && endValid && Number(endOdometer) >= Number(startOdometer);
        }
        return startValid;
      }
      case 2:
        return true;
      case 3:
        return true;
      case 4:
        return condition !== undefined;
      case 5:
        return signature.length > 0;
      case 6:
        return true;
      default:
        return false;
    }
  }, [step, allPhotosCaptured, startOdometer, endOdometer, checkType, condition, signature]);

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

    const check: CheckRecord = {
      id: generateId(),
      vehicleId: vehicle.id,
      fleetId: fleet.id,
      driverId: user.id,
      driverName: user.name,
      type: checkType,
      photos: photoRecords,
      startOdometer: Number(startOdometer),
      endOdometer: endOdometer ? Number(endOdometer) : undefined,
      maintenanceIssues: issues,
      maintenanceNotes: maintenanceNotes || undefined,
      fuelReceiptUrl: fuelReceipt || undefined,
      towEquipmentCheck: showTowCheck ? towCheck : undefined,
      conditionRating: condition,
      signatureDataUrl: signature,
      notes: notes || undefined,
      overrideBy: overrideReason && canOverride(user.role) ? user.name : undefined,
      overrideReason: overrideReason || undefined,
      synced: navigator.onLine,
      createdAt: new Date().toISOString(),
    };

    await saveCheck(check);

    const mileage = endOdometer ? Number(endOdometer) : Number(startOdometer);
    await saveVehicle({ ...vehicle, lastMileage: mileage });

    let updatedVehicle = { ...vehicle, lastMileage: mileage };
    if (issues.length > 0 || condition === "poor") {
      await updateVehicleStatus(vehicle.id, "needs_work");
      updatedVehicle = { ...updatedVehicle, status: "needs_work" };
    }

    await processCheckNotifications(check, updatedVehicle);

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

  if (completed && savedCheck) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Complete" />
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
      />

      <div className="max-w-lg mx-auto px-4 py-4 flex-1 flex flex-col w-full">
        <ProgressBar
          current={step + 1}
          total={STEPS.length}
          label={STEPS[step]}
          className="mb-6"
        />

        <div className="flex-1">
          {/* Step 0: Photos */}
          {step === 0 && (
            <GuidedPhotoCapture
              photos={photos}
              currentIndex={photoIndex}
              onIndexChange={setPhotoIndex}
              onCapture={(angle, url) => {
                setPhotos((prev) => ({ ...prev, [angle]: url }));
                const idx = requiredPhotos.findIndex((p) => p.angle === angle);
                if (idx >= 0 && idx < requiredPhotos.length - 1) {
                  setTimeout(() => setPhotoIndex(idx + 1), 400);
                }
              }}
              onClear={(angle) => {
                setPhotos((prev) => {
                  const next = { ...prev };
                  delete next[angle];
                  return next;
                });
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
                    ? "Enter your start and end odometer readings."
                    : "Enter the odometer reading now."}
                </p>
              </div>
              <Input
                label="Start Odometer"
                type="number"
                inputMode="numeric"
                placeholder="e.g. 45230"
                value={startOdometer}
                onChange={(e) => setStartOdometer(e.target.value)}
                hint="Mileage when you started"
              />
              <Input
                label={checkType === "check_out" ? "End Odometer" : "End Odometer (optional)"}
                type="number"
                inputMode="numeric"
                placeholder="e.g. 45310"
                value={endOdometer}
                onChange={(e) => setEndOdometer(e.target.value)}
                hint={
                  checkType === "check_out"
                    ? "Mileage when you finished"
                    : "Leave blank if not ending a trip"
                }
              />
              {endOdometer && startOdometer && Number(endOdometer) >= Number(startOdometer) && (
                <div className="bg-brand-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-gray-600">Distance driven</p>
                  <p className="text-2xl font-bold text-brand-700">
                    {(Number(endOdometer) - Number(startOdometer)).toLocaleString()} miles
                  </p>
                </div>
              )}
              {endOdometer && startOdometer && Number(endOdometer) < Number(startOdometer) && (
                <p className="text-red-600 text-sm text-center font-medium">
                  End mileage must be equal to or greater than start mileage.
                </p>
              )}
            </div>
          )}

          {/* Step 2: Issues */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-gray-900">Any Problems?</h2>
                <p className="text-base text-gray-600 mt-1">
                  Tap everything that applies. Skip if all is good.
                </p>
              </div>
              {fleet && getFleetConfig(fleet.type).maintenancePriority.length > 0 && (
                <p className="text-xs text-brand-600 bg-brand-50 rounded-lg px-3 py-2">
                  Priority for {fleet.type.replace(/_/g, " ")} fleet:{" "}
                  {getFleetConfig(fleet.type).maintenancePriority
                    .map((p) => MAINTENANCE_ISSUES.find((m) => m.id === p)?.label)
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[...MAINTENANCE_ISSUES].sort((a, b) => {
                  const priority = fleet ? getFleetConfig(fleet.type).maintenancePriority : [];
                  const ai = priority.indexOf(a.id);
                  const bi = priority.indexOf(b.id);
                  if (ai === -1 && bi === -1) return 0;
                  if (ai === -1) return 1;
                  if (bi === -1) return -1;
                  return ai - bi;
                }).map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => toggleIssue(issue.id)}
                    className={`p-4 rounded-xl border-2 text-sm font-medium transition-colors min-h-[56px] ${
                      issues.includes(issue.id)
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {issue.label}
                  </button>
                ))}
              </div>
              {issues.includes("other") && (
                <VoiceInput
                  value={maintenanceNotes}
                  onChange={setMaintenanceNotes}
                  placeholder="Describe the issue..."
                />
              )}
            </div>
          )}

          {/* Step 3: Extras */}
          {step === 3 && (
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
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    Tow Truck Equipment Check
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
                        className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200"
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
                          className="h-5 w-5 rounded border-gray-300 text-brand-600"
                        />
                        <span className="text-sm font-medium">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <VoiceInput
                value={notes}
                onChange={setNotes}
                placeholder="Additional notes (optional)..."
              />
            </div>
          )}

          {/* Step 4: Condition */}
          {step === 4 && (
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

          {/* Step 5: Signature */}
          {step === 5 && (
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

          {/* Step 6: Review */}
          {step === 6 && (
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
                    {Number(startOdometer).toLocaleString()} mi
                    {endOdometer && ` → ${Number(endOdometer).toLocaleString()} mi`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Photos</span>
                  <span className="font-medium">{Object.keys(photos).length} captured</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Issues</span>
                  <span className="font-medium">
                    {issues.length > 0 ? issues.length : "None"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Condition</span>
                  <span className="font-medium capitalize">{condition}</span>
                </div>
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
