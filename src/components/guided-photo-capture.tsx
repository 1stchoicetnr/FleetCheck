"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { ProgressBar } from "./ui/progress-bar";
import { PhotoExampleCard } from "./photo-example-image";
import { compressImageFile } from "@/lib/utils";
import { LiveCameraFrame } from "./live-camera-frame";
import { PHOTO_ANGLES, PhotoAngle, PhotoStep, walkaroundPhotoSteps } from "@/lib/types";
import { DAMAGE_NOTE_MAX } from "@/lib/photo-flags";
import {
  isBlockingPhotoIssue,
  needsSharpPhoto,
  photoQualityIssue,
  photoQualityMessage,
  type PhotoQualityIssue,
} from "@/lib/photo-quality";
import {
  isLibraryPhoto,
  LIBRARY_PHOTO_MESSAGE,
  ODOMETER_UNREADABLE,
  odometerDigits,
  odometerMismatchMessage,
  odometerReadingMatches,
} from "@/lib/odometer-match";
import { recognizeOdometerDigits } from "@/lib/odometer-ocr";
import { damageActor } from "@/lib/photo-flags";
import { stampPhotoDataUrl } from "@/lib/photo-stamp";
import { useCheckoutFeedback } from "@/components/checkout-feedback";
import { primaryButtonClass } from "@/lib/button-styles";

interface GuidedPhotoCaptureProps {
  photos: Partial<Record<PhotoAngle, string>>;
  photoFlags?: Partial<
    Record<PhotoAngle, { flaggedDamage: boolean; damageNote?: string; qualityNote?: string }>
  >;
  onAccept: (angle: PhotoAngle, dataUrl: string) => void;
  onClear: (angle: PhotoAngle) => void;
  onFlagDamage?: (angle: PhotoAngle, flaggedDamage: boolean) => void;
  onDamageNote?: (angle: PhotoAngle, damageNote: string) => void;
  onQualityNote?: (angle: PhotoAngle, qualityNote: string) => void;
  onAllComplete: () => void;
  /** Dev: browse all steps without requiring captures */
  testingBrowseMode?: boolean;
  /** Company checklist. Defaults to the walkaround without tire-tread slots. */
  steps?: PhotoStep[];
  testingFinishLabel?: string;
  allCompleteMessage?: string;
  driverName?: string;
  odometer?: string | number;
  prior?: {
    driverName: string;
    photos: Partial<Record<PhotoAngle, string>>;
  } | null;
}

export function GuidedPhotoCapture({
  photos,
  photoFlags,
  onAccept,
  onClear,
  onFlagDamage,
  onDamageNote,
  onQualityNote,
  onAllComplete,
  testingBrowseMode = false,
  steps = walkaroundPhotoSteps(PHOTO_ANGLES),
  testingFinishLabel = "Finish preview → Mileage",
  allCompleteMessage = "All photos accepted — moving to mileage...",
  driverName,
  odometer,
  prior,
}: GuidedPhotoCaptureProps) {
  const requiredPhotos = steps.filter((p) => p.required);
  const acceptedCount = requiredPhotos.filter((p) => photos[p.angle]).length;
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const firstIncompleteIndex = useMemo(() => {
    const idx = requiredPhotos.findIndex((p) => !photos[p.angle]);
    return idx === -1 ? requiredPhotos.length - 1 : idx;
  }, [photos, requiredPhotos]);

  const [viewIndex, setViewIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState("");
  const [cameraOff, setCameraOff] = useState(false);
  const [pending, setPending] = useState<{
    dataUrl: string;
    issue: PhotoQualityIssue | null;
    blockReason?: string;
  } | null>(null);
  const [qualityNote, setQualityNote] = useState("");

  const currentIndex = testingBrowseMode
    ? viewIndex
    : Math.min(viewIndex, firstIncompleteIndex);
  const current = requiredPhotos[currentIndex];
  const allComplete = acceptedCount === requiredPhotos.length;
  const value = current ? photos[current.angle] : undefined;
  const isLastStep = currentIndex === requiredPhotos.length - 1;
  const canGoPrev = currentIndex > 0;
  const canGoNext =
    currentIndex < requiredPhotos.length - 1 &&
    (testingBrowseMode ||
      !!photos[requiredPhotos[currentIndex + 1]?.angle] ||
      currentIndex + 1 === firstIncompleteIndex);

  const handleAccept = (dataUrl: string) => {
    if (!current) return;
    onAccept(current.angle, dataUrl);
    setPickError("");

    if (isLastStep) {
      setTimeout(() => onAllComplete(), 400);
    } else if (!testingBrowseMode) {
      setTimeout(() => setViewIndex(currentIndex + 1), 200);
    } else {
      setTimeout(() => setViewIndex(currentIndex + 1), 300);
    }
  };

  const handlePickedFile = async (file: File) => {
    if (!current) return;
    if (isLibraryPhoto(file.lastModified, Date.now())) {
      setPickError(LIBRARY_PHOTO_MESSAGE);
      return;
    }
    setBusy(true);
    setPickError("");
    try {
      const compressed = await compressImageFile(file);
      const issue = await readPhotoQuality(compressed);
      if (isBlockingPhotoIssue(issue) && issue) {
        setQualityNote("");
        setPending({
          dataUrl: compressed,
          issue,
          blockReason: photoQualityMessage(issue),
        });
        return;
      }
      const glare =
        needsSharpPhoto(current.angle) && issue === "glare" ? issue : null;
      if (current.angle === "odometer_fuel") {
        let read = "";
        try {
          read = await recognizeOdometerDigits(compressed);
        } catch {
          read = "";
        }
        if (!odometerReadingMatches(odometer ?? "", read)) {
          setPending({
            dataUrl: compressed,
            issue: null,
            blockReason: odometerDigits(odometer ?? "")
              ? odometerMismatchMessage(odometer ?? "")
              : ODOMETER_UNREADABLE,
          });
          return;
        }
      }
      const stamped = await stampPhotoDataUrl(compressed, new Date().toISOString());
      setQualityNote("");
      setPending({ dataUrl: stamped, issue: glare });
    } catch {
      setPickError("Could not use that photo. Try the camera again.");
    } finally {
      setBusy(false);
    }
  };

  const usePendingPhoto = () => {
    if (!current || !pending) return;
    if (pending.blockReason) return;
    if (pending.issue && !qualityNote.trim()) return;
    if (qualityNote.trim()) onQualityNote?.(current.angle, qualityNote.trim());
    const dataUrl = pending.dataUrl;
    setPending(null);
    setQualityNote("");
    handleAccept(dataUrl);
  };

  const retakePending = () => {
    setPending(null);
    setQualityNote("");
    setPickError("");
  };

  const advanceWithoutPhoto = () => {
    if (isLastStep) {
      onAllComplete();
    } else {
      setViewIndex(currentIndex + 1);
    }
  };

  const openNativeCamera = () => {
    if (!current || value || busy) return;
    cameraInputRef.current?.click();
  };

  const retakeAccepted = () => {
    if (!current) return;
    onClear(current.angle);
    setPickError("");
  };

  const goToStep = (index: number) => {
    setPending(null);
    setQualityNote("");
    setViewIndex(index);
  };

  const feedback = useCheckoutFeedback();
  const photoStepLabel = current?.label;
  const photoStepTotal = requiredPhotos.length;
  useEffect(() => {
    if (!photoStepLabel) {
      feedback?.setPhotoStep(null);
      return;
    }
    feedback?.setPhotoStep({
      index: currentIndex + 1,
      total: photoStepTotal,
      label: photoStepLabel,
    });
    return () => feedback?.setPhotoStep(null);
  }, [feedback, photoStepLabel, currentIndex, photoStepTotal]);

  if (!current) return null;

  return (
    <div className="photo-step-shell space-y-5">
      <div className="photo-step-progress">
        <ProgressBar
          current={testingBrowseMode ? currentIndex + 1 : acceptedCount}
          total={requiredPhotos.length}
          label={
            testingBrowseMode
              ? `Preview — step ${currentIndex + 1} of ${requiredPhotos.length}`
              : `Photos — ${acceptedCount} of ${requiredPhotos.length} accepted`
          }
        />
      </div>

      {testingBrowseMode && (
        <p className="photo-step-testing-banner text-center text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg py-2 px-3">
          <strong>For testing only.</strong> Browse all 30 steps — tap{" "}
          <strong>Next step (no photo)</strong> or jump using the numbers below.
        </p>
      )}

      <div className="photo-step-card bg-[#121214] rounded-2xl border border-[#2e2e32] overflow-hidden shadow-card">
        <div className="photo-step-heading px-5 pt-5 pb-4 border-b border-[#2e2e32]">
              <span className="inline-block bg-emerald-500/15 text-emerald-300 text-sm font-bold px-3 py-1 rounded-full mb-2">
                Photo {currentIndex + 1} of {requiredPhotos.length}
              </span>
              <h2 className="text-4xl font-black tracking-tight text-white">{current.label}</h2>
              <p className="photo-step-instruction text-base text-[#d4d4d8] mt-2 leading-relaxed">
                {current.instruction}
              </p>
              {current.helper && (
                <p className="photo-step-helper mt-2 text-sm text-amber-200/90 leading-relaxed bg-amber-950/40 border border-amber-700/40 rounded-lg px-3 py-2">
                  {current.helper}
                </p>
              )}
            </div>

            {pending ? (
              <div className="p-4 space-y-4">
                <p className="text-2xl font-bold text-white text-center">
                  {pending.blockReason
                    ? "Retake this photo"
                    : `Is this the ${current.label.toLowerCase()}?`}
                </p>
                <div className="flex items-start gap-2">
                  <div className="relative min-w-0 flex-1 rounded-xl overflow-hidden border-2 border-[#5c5c64] bg-black flex items-center justify-center min-h-[140px] max-h-[min(42vh,280px)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pending.dataUrl}
                      alt={current.label}
                      className="w-full h-full max-h-[min(42vh,280px)] object-contain"
                    />
                  </div>
                  <PriorDriverPhoto
                    url={prior?.photos[current.angle]}
                    driverName={prior?.driverName}
                  />
                </div>
                {pending.blockReason ? (
                  <p className="text-sm font-semibold text-amber-200">{pending.blockReason}</p>
                ) : pending.issue ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-amber-200">
                      {photoQualityMessage(pending.issue)}
                    </p>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-semibold text-[#e4e4e7]">
                        Note to use this photo
                      </span>
                      <textarea
                        value={qualityNote}
                        maxLength={DAMAGE_NOTE_MAX}
                        rows={2}
                        onChange={(event) => setQualityNote(event.target.value)}
                        placeholder="For example, flash was on and the card still reads."
                        className="w-full rounded-xl border border-[#5c5c64] bg-[#1c1c1e] px-3 py-2 text-sm text-white placeholder:text-[#8b8b93]"
                      />
                    </label>
                  </div>
                ) : null}
                {pending.blockReason ? (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full border-red-400/50 text-red-300 bg-red-950/30 hover:bg-red-950/50"
                    onClick={retakePending}
                  >
                    Retake
                  </Button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="lg"
                      className="border-red-400/50 text-red-300 bg-red-950/30 hover:bg-red-950/50"
                      onClick={retakePending}
                    >
                      Retake
                    </Button>
                    <Button
                      size="lg"
                      onClick={usePendingPhoto}
                      disabled={Boolean(pending.issue && !qualityNote.trim())}
                    >
                      Use photo
                    </Button>
                  </div>
                )}
              </div>
            ) : value ? (
              <div className="p-4 space-y-4">
                <div className="flex items-start gap-2">
                <div className="photo-accepted-frame relative min-w-0 flex-1 rounded-xl overflow-hidden border-2 border-emerald-500/60 bg-black flex items-center justify-center min-h-[140px] max-h-[min(42vh,280px)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={value}
                    alt={current.label}
                    className="w-full h-full max-h-[min(55vh,360px)] object-contain"
                  />
                  <div className="absolute top-3 left-3 bg-[#22c55e] text-[#052e16] rounded-full px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5 shadow">
                    <Check className="h-4 w-4" />
                    Accepted
                  </div>
                  {photoFlags?.[current.angle]?.flaggedDamage && (
                    <div className="absolute top-3 right-3 bg-[#b91c1c] text-white rounded-full px-3 py-1.5 text-sm font-semibold shadow">
                      DAMAGE · {damageActor(driverName)}
                    </div>
                  )}
                </div>
                <PriorDriverPhoto
                  url={prior?.photos[current.angle]}
                  driverName={prior?.driverName}
                />
                </div>
                {onFlagDamage && (
                  <button
                    type="button"
                    onClick={() =>
                      onFlagDamage(
                        current.angle,
                        !photoFlags?.[current.angle]?.flaggedDamage
                      )
                    }
                    className={`w-full min-h-[48px] rounded-xl border-2 text-sm font-semibold ${
                      photoFlags?.[current.angle]?.flaggedDamage
                        ? "border-red-500 bg-red-950/40 text-red-100"
                        : "border-[#5c5c64] bg-[#1c1c1e] text-[#e4e4e7]"
                    }`}
                  >
                    {photoFlags?.[current.angle]?.flaggedDamage
                      ? "DAMAGE flagged — tap to clear"
                      : "Mark this angle as DAMAGE / new damage"}
                  </button>
                )}
                {onDamageNote && photoFlags?.[current.angle]?.flaggedDamage && (
                  <label className="block space-y-1.5">
                    <span className="text-sm font-semibold text-[#e4e4e7]">
                      Damage note (optional)
                    </span>
                    <textarea
                      value={photoFlags[current.angle]?.damageNote ?? ""}
                      maxLength={DAMAGE_NOTE_MAX}
                      rows={3}
                      onChange={(e) => onDamageNote(current.angle, e.target.value)}
                      placeholder="What is damaged? For example, cracked bumper."
                      className="w-full rounded-xl border border-[#5c5c64] bg-[#1c1c1e] px-3 py-2 text-sm text-white placeholder:text-[#8b8b93]"
                    />
                  </label>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full border-red-400/50 text-red-300 bg-red-950/30 hover:bg-red-950/50"
                  onClick={retakeAccepted}
                >
                  Retake This Photo
                </Button>
                {testingBrowseMode && (
                  <Button
                    size="lg"
                    className="photo-step-testing-next w-full"
                    onClick={advanceWithoutPhoto}
                  >
                    {isLastStep ? testingFinishLabel : "Next step"}
                    <ChevronRight className="h-5 w-5 ml-1" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="photo-capture-body p-4 space-y-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {cameraOff ? (
                      <PhotoExampleCard
                        angle={current.angle}
                        label={current.label}
                        category={current.category}
                      />
                    ) : (
                      <LiveCameraFrame
                        angle={current.angle}
                        busy={busy}
                        onCapture={(file) => void handlePickedFile(file)}
                        onUnavailable={() => setCameraOff(true)}
                      />
                    )}
                  </div>
                  <PriorDriverPhoto
                    url={prior?.photos[current.angle]}
                    driverName={prior?.driverName}
                  />
                </div>
                <div className="photo-capture-actions space-y-3">
                  {cameraOff && (
                    <p className="photo-capture-hint text-center text-xs text-gray-500">
                      Match the example, then take the photo with your phone camera
                    </p>
                  )}

                  {pickError && (
                    <p className="text-center text-sm text-red-300 font-medium">
                      {pickError}
                    </p>
                  )}

                  {testingBrowseMode && (
                    <Button
                      size="lg"
                      className="photo-step-testing-next w-full"
                      onClick={advanceWithoutPhoto}
                    >
                      {isLastStep ? testingFinishLabel : "Next step (no photo)"}
                      <ChevronRight className="h-5 w-5 ml-1" />
                    </Button>
                  )}

                  {cameraOff && (
                    <button
                      type="button"
                      onClick={openNativeCamera}
                      disabled={busy}
                      className={`photo-take-btn w-full h-16 rounded-2xl active:scale-[0.98] transition-all shadow-card flex items-center justify-center gap-3 font-bold text-lg ${primaryButtonClass}`}
                    >
                      <Camera className="h-7 w-7" />
                      {busy ? "Saving photo…" : "Take photo"}
                    </button>
                  )}
                  <p className="photo-capture-flash-hint text-center text-xs text-gray-400 leading-snug px-1">
                    Live camera only. The time is saved on the photo. Turn on a light if the shot is dark.
                  </p>
                </div>
              </div>
            )}
      </div>

      <div className="photo-step-nav flex items-center gap-2">
        {canGoPrev && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => goToStep(currentIndex - 1)}
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
          {requiredPhotos.map((p, i) => {
            const done = !!photos[p.angle];
            const damaged = !!photoFlags?.[p.angle]?.flaggedDamage;
            const isCurrent = i === currentIndex;
            const canView =
              testingBrowseMode || done || i === firstIncompleteIndex;
            return (
              <button
                key={p.angle}
                type="button"
                disabled={!canView}
                onClick={() => canView && goToStep(i)}
                title={p.label}
                className={`flex-shrink-0 min-w-[44px] h-11 px-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-100 ${
                  !canView
                    ? "bg-[#2a2a2e] text-[#d4d4d8] cursor-not-allowed"
                    : damaged
                    ? "bg-[#b91c1c] text-white"
                    : done
                    ? "bg-[#22c55e] text-[#052e16]"
                    : isCurrent
                    ? "bg-[#22c55e] text-[#052e16] ring-2 ring-[#86efac]"
                    : "bg-[#3a3a40] text-[#e4e4e7]"
                }`}
              >
                {done ? "✓" : i + 1}
              </button>
            );
          })}
        </div>

        {canGoNext && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => goToStep(currentIndex + 1)}
            aria-label="Next photo"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </div>

      {allComplete && !testingBrowseMode && (
        <p className="text-center text-green-700 font-semibold text-sm bg-green-50 rounded-xl py-3 border border-green-200">
          {allCompleteMessage}
        </p>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handlePickedFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function PriorDriverPhoto({
  url,
  driverName,
}: {
  url?: string;
  driverName?: string;
}) {
  if (!url || !driverName?.trim()) return null;
  return (
    <div className="w-[34%] max-w-[128px] shrink-0 space-y-1">
      <p className="text-[11px] leading-tight font-semibold text-[#d4d4d8]">
        Previous · {driverName.trim()}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Previous photo by ${driverName.trim()}`}
        className="aspect-[4/3] w-full rounded-lg border border-[#3a3a40] object-cover"
      />
    </div>
  );
}

async function readPhotoQuality(dataUrl: string): Promise<PhotoQualityIssue | null> {
  if (typeof document === "undefined") return null;
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("photo"));
    image.src = dataUrl;
  });
  const width = 64;
  const height = Math.max(
    1,
    Math.round((image.height || 1) * (width / Math.max(image.width, 1)))
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height);
  return photoQualityIssue(data.data, width, height);
}
