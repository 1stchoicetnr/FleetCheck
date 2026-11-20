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
import { isUsableImageDataUrl, MAX_QUEUED_PHOTO_CHARS } from "@/lib/canvas-safe";
import { LiveCameraFrame } from "./live-camera-frame";
import {
  PHOTO_ANGLES,
  PhotoAngle,
  PhotoFlagState,
  PhotoStep,
  walkaroundPhotoSteps,
} from "@/lib/types";
import {
  cleanQualityOverride,
  defaultOverrideReason,
  OVERRIDE_REASON_MAX,
  OVERRIDE_REASONS,
  overrideReasonText,
  type PhotoQualityOverride,
} from "@/lib/photo-override";
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
import { DamageCloseUpPanel } from "@/components/damage-closeup-panel";
import { closeUpAngle, closeUpMissing, needsCloseUp, type DamageSpot } from "@/lib/damage-closeup";
import { primaryButtonClass } from "@/lib/button-styles";

interface GuidedPhotoCaptureProps {
  photos: Partial<Record<PhotoAngle, string>>;
  photoFlags?: Partial<Record<PhotoAngle, PhotoFlagState>>;
  onAccept: (angle: PhotoAngle, dataUrl: string) => void;
  onClear: (angle: PhotoAngle) => void;
  onFlagDamage?: (angle: PhotoAngle, flaggedDamage: boolean) => void;
  onDamageNote?: (angle: PhotoAngle, damageNote: string) => void;
  onQualityNote?: (angle: PhotoAngle, qualityNote: string) => void;
  /** Driver kept a dark, blank, or blurry photo with "Use anyway". */
  onQualityOverride?: (angle: PhotoAngle, issue: PhotoQualityOverride, reason: string) => void;
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
  /** Active known damage on this unit. On those slots the driver must answer Same / New. */
  knownDamage?: KnownDamagePrompt[];
  onKnownDamageAnswer?: (angle: PhotoAngle, knownDamageId: string, answer: "same" | "new") => void;
  /** Slots the Precheck noted as damaged. They need a close-up too unless the driver said "Same as before". */
  closeUpSlots?: PhotoAngle[];
  /** Required damage close-up: diagram tap and close-up photo. Both must be set to turn it on. */
  onDamageSpot?: (angle: PhotoAngle, spot: DamageSpot) => void;
  onCloseUp?: (angle: PhotoAngle, dataUrl: string | null) => void;
}

export type KnownDamagePrompt = {
  id: string;
  angle: PhotoAngle;
  description: string;
  note?: string;
  sourceReportId?: string;
};

export function GuidedPhotoCapture({
  photos,
  photoFlags,
  onAccept,
  onClear,
  onFlagDamage,
  onDamageNote,
  onQualityNote,
  onQualityOverride,
  onAllComplete,
  testingBrowseMode = false,
  steps = walkaroundPhotoSteps(PHOTO_ANGLES),
  testingFinishLabel = "Finish preview → Mileage",
  allCompleteMessage = "All photos accepted — moving to mileage...",
  driverName,
  odometer,
  prior,
  knownDamage,
  onKnownDamageAnswer,
  closeUpSlots = [],
  onDamageSpot,
  onCloseUp,
}: GuidedPhotoCaptureProps) {
  const closeUpOn = Boolean(onDamageSpot && onCloseUp);
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
    /** Soft warning: driver may still use the photo; it is flagged for office review. */
    warning?: string;
  } | null>(null);
  const [qualityNote, setQualityNote] = useState("");
  /** "Use anyway" was tapped on a dark/blank/blurry warning; reason chips are showing. */
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const currentIndex = testingBrowseMode
    ? viewIndex
    : Math.min(viewIndex, firstIncompleteIndex);
  const current = requiredPhotos[currentIndex];
  const allComplete = acceptedCount === requiredPhotos.length;
  const value = current ? photos[current.angle] : undefined;
  const isLastStep = currentIndex === requiredPhotos.length - 1;
  const canGoPrev = currentIndex > 0;
  /** Flagged damage here still needs its diagram tap or close-up. */
  const closeUpGap =
    closeUpOn && current && value
      ? closeUpMissing(current.angle, photoFlags?.[current.angle], photos, closeUpSlots)
      : null;
  const closeUpHere =
    closeUpOn && current && value
      ? needsCloseUp(current.angle, photoFlags?.[current.angle], closeUpSlots)
      : false;
  const canGoNext =
    !closeUpGap &&
    currentIndex < requiredPhotos.length - 1 &&
    (testingBrowseMode ||
      !!photos[requiredPhotos[currentIndex + 1]?.angle] ||
      currentIndex + 1 === firstIncompleteIndex);

  /** Photo waiting for the driver's Same / New answer on a known-damage slot. */
  const [knownAsk, setKnownAsk] = useState<{ dataUrl: string; item: KnownDamagePrompt } | null>(null);
  const knownForCurrent = current
    ? knownDamage?.find((item) => item.angle === current.angle)
    : undefined;

  const handleAccept = (dataUrl: string) => {
    if (!current) return;
    if (
      knownForCurrent &&
      onKnownDamageAnswer &&
      photoFlags?.[current.angle]?.knownDamageId !== knownForCurrent.id
    ) {
      setKnownAsk({ dataUrl, item: knownForCurrent });
      return;
    }
    acceptAndAdvance(dataUrl);
  };

  const answerKnown = (answer: "same" | "new") => {
    if (!current || !knownAsk) return;
    onKnownDamageAnswer?.(current.angle, knownAsk.item.id, answer);
    // "New damage" alerts as normal: flag the slot so it goes to Slack and Bell.
    if (answer === "new") onFlagDamage?.(current.angle, true);
    const dataUrl = knownAsk.dataUrl;
    setKnownAsk(null);
    acceptAndAdvance(dataUrl, answer === "new" ? "new" : answer);
  };

  const acceptAndAdvance = (dataUrl: string, knownAnswer?: "same" | "new") => {
    if (!current) return;
    onAccept(current.angle, dataUrl);
    setPickError("");
    // Damage on this slot: stay here for the diagram tap and close-up.
    const flags = photoFlags?.[current.angle];
    if (
      closeUpOn &&
      needsCloseUp(
        current.angle,
        {
          ...flags,
          flaggedDamage: knownAnswer === "new" || Boolean(flags?.flaggedDamage),
          knownDamageAnswer: knownAnswer ?? flags?.knownDamageAnswer,
        },
        closeUpSlots
      ) &&
      closeUpMissing(current.angle, { ...flags, flaggedDamage: true }, photos, closeUpSlots)
    ) {
      return;
    }

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
      if (!isUsableImageDataUrl(compressed) || compressed.length > MAX_QUEUED_PHOTO_CHARS) {
        // The phone could not shrink this photo (an iPhone out of photo memory).
        // A photo that can never upload must not get into the check.
        setPickError("Could not save that photo. Take it again.");
        return;
      }
      const issue = await readPhotoQuality(compressed);
      if (isBlockingPhotoIssue(issue) && issue) {
        setQualityNote("");
        setOverrideOpen(false);
        setOverrideReason("");
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
        let ocrAvailable = true;
        try {
          read = await recognizeOdometerDigits(compressed);
        } catch {
          // The reader could not run (slow or no signal, old phone). That is not
          // the driver's fault, so the photo goes on without a mileage warning.
          ocrAvailable = false;
        }
        if (ocrAvailable && !odometerReadingMatches(odometer ?? "", read)) {
          // Never hard-block: phone OCR misreads odometers often. Warn, let the
          // driver retake or continue, and flag the photo for office review.
          const stampedOdo = await stampPhotoDataUrl(compressed, new Date().toISOString());
          setQualityNote("");
          setPending({
            dataUrl: stampedOdo,
            issue: null,
            warning: odometerDigits(odometer ?? "")
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
    const note = pending.warning
      ? [`Odometer check: ${pending.warning}`, qualityNote.trim()].filter(Boolean).join(" Driver note: ")
      : qualityNote.trim();
    if (note) onQualityNote?.(current.angle, note);
    const dataUrl = pending.dataUrl;
    setPending(null);
    setQualityNote("");
    handleAccept(dataUrl);
  };

  /** Keep a dark, blank, or blurry photo. The check is not failed; office sees a marker. */
  const keepBlockedPhoto = async () => {
    if (!current || !pending?.blockReason) return;
    const issue = cleanQualityOverride(pending.issue);
    if (!issue) return;
    const reason = overrideReasonText(overrideReason || defaultOverrideReason(issue), qualityNote);
    let dataUrl = pending.dataUrl;
    try {
      dataUrl = await stampPhotoDataUrl(pending.dataUrl, new Date().toISOString());
    } catch {
      // Keep the unstamped photo rather than losing it.
    }
    onQualityOverride?.(current.angle, issue, reason);
    setPending(null);
    setQualityNote("");
    setOverrideOpen(false);
    setOverrideReason("");
    handleAccept(dataUrl);
  };

  const retakePending = () => {
    setPending(null);
    setOverrideOpen(false);
    setOverrideReason("");
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
    setKnownAsk(null);
    setPending(null);
    setOverrideOpen(false);
    setOverrideReason("");
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

            {knownAsk ? (
              <KnownDamageQuestion
                item={knownAsk.item}
                photo={knownAsk.dataUrl}
                label={current.label}
                onAnswer={answerKnown}
                onRetake={() => setKnownAsk(null)}
              />
            ) : pending ? (
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
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-amber-200">{pending.blockReason}</p>
                    {overrideOpen && cleanQualityOverride(pending.issue) && (
                      <div className="photo-use-anyway space-y-2 rounded-xl border border-amber-700/50 bg-amber-950/30 p-3">
                        <p className="text-xs text-[#c4c4cc]">
                          Why keep it? The office will see you kept this photo.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {OVERRIDE_REASONS[cleanQualityOverride(pending.issue)!].map((reason) => {
                            const issue = cleanQualityOverride(pending.issue)!;
                            const selected = (overrideReason || defaultOverrideReason(issue)) === reason;
                            return (
                              <button
                                key={reason}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setOverrideReason(reason)}
                                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                                  selected
                                    ? "border-amber-300 bg-amber-300 text-black"
                                    : "border-[#5c5c64] text-[#e4e4e7]"
                                }`}
                              >
                                {reason}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="text"
                          value={qualityNote}
                          maxLength={OVERRIDE_REASON_MAX}
                          onChange={(event) => setQualityNote(event.target.value)}
                          placeholder="Note (optional)"
                          aria-label="Note (optional)"
                          className="w-full rounded-xl border border-[#5c5c64] bg-[#1c1c1e] px-3 py-2 text-sm text-white placeholder:text-[#8b8b93]"
                        />
                      </div>
                    )}
                  </div>
                ) : pending.warning ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-amber-200">{pending.warning}</p>
                    <p className="text-xs text-[#c4c4cc]">
                      You can still use this photo. The office will review the mileage.
                    </p>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-semibold text-[#e4e4e7]">Note (optional)</span>
                      <textarea
                        value={qualityNote}
                        maxLength={DAMAGE_NOTE_MAX}
                        rows={2}
                        onChange={(event) => setQualityNote(event.target.value)}
                        placeholder="For example, the photo is clear and shows the mileage I typed."
                        className="w-full rounded-xl border border-[#5c5c64] bg-[#1c1c1e] px-3 py-2 text-sm text-white placeholder:text-[#8b8b93]"
                      />
                    </label>
                  </div>
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
                  <div className="space-y-2">
                    <Button size="lg" className="w-full" onClick={retakePending}>
                      Retake
                    </Button>
                    {cleanQualityOverride(pending.issue) &&
                      (overrideOpen ? (
                        <Button
                          variant="outline"
                          size="lg"
                          className="w-full border-amber-400/50 text-amber-200 bg-amber-950/30 hover:bg-amber-950/50"
                          onClick={() => void keepBlockedPhoto()}
                        >
                          Keep this photo
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="lg"
                          className="w-full border-[#5c5c64] text-[#e4e4e7]"
                          onClick={() => setOverrideOpen(true)}
                        >
                          Use anyway
                        </Button>
                      ))}
                  </div>
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
                {closeUpHere && onDamageSpot && onCloseUp && (
                  <DamageCloseUpPanel
                    label={current.label}
                    spot={photoFlags?.[current.angle]?.damageSpot}
                    closeUp={photos[closeUpAngle(current.angle)]}
                    onSpot={(spot) => onDamageSpot(current.angle, spot)}
                    onCloseUp={(dataUrl) => onCloseUp(current.angle, dataUrl)}
                    onRetakeCloseUp={() => onCloseUp(current.angle, null)}
                  />
                )}
                {closeUpHere && !closeUpGap && !testingBrowseMode && (
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => (isLastStep ? onAllComplete() : goToStep(currentIndex + 1))}
                  >
                    {isLastStep ? "Done with photos" : "Next photo"}
                    <ChevronRight className="h-5 w-5 ml-1" />
                  </Button>
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
              (testingBrowseMode || done || i === firstIncompleteIndex) &&
              (!closeUpGap || i === currentIndex);
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

/** Known damage on this slot: show it and require Same as before / New damage. */
function KnownDamageQuestion({
  item,
  photo,
  label,
  onAnswer,
  onRetake,
}: {
  item: KnownDamagePrompt;
  photo: string;
  label: string;
  onAnswer: (answer: "same" | "new") => void;
  onRetake: () => void;
}) {
  const knownSrc = item.sourceReportId
    ? `/api/checkout-reports/${encodeURIComponent(item.sourceReportId)}/photos/${encodeURIComponent(item.angle)}`
    : "";
  return (
    <div className="p-4 space-y-3">
      <div className="rounded-xl border border-amber-400/60 bg-amber-950/30 p-3 space-y-1">
        <p className="text-sm font-bold text-amber-100">Known damage on {label}</p>
        <p className="text-sm text-amber-100">{item.description}</p>
        {item.note && <p className="text-xs text-amber-200">{item.note}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <figure className="min-w-0">
          <div className="aspect-[4/3] overflow-hidden rounded-lg border border-[#3a3a40] bg-black">
            {knownSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={knownSrc} alt="Known damage" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[#8b8b93]">No photo</div>
            )}
          </div>
          <figcaption className="mt-0.5 text-[11px] text-[#d4d4d8]">Before (known)</figcaption>
        </figure>
        <figure className="min-w-0">
          <div className="aspect-[4/3] overflow-hidden rounded-lg border border-[#3a3a40] bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="Your photo" className="h-full w-full object-cover" />
          </div>
          <figcaption className="mt-0.5 text-[11px] text-[#d4d4d8]">Your photo</figcaption>
        </figure>
      </div>
      <p className="text-sm font-semibold text-white">Is it the same as before?</p>
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" onClick={() => onAnswer("same")}>
          Same as before
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="border-red-400/60 text-red-200 bg-red-950/40 hover:bg-red-950/60"
          onClick={() => onAnswer("new")}
        >
          New damage
        </Button>
      </div>
      <Button variant="outline" size="lg" className="w-full border-[#5c5c64] text-[#e4e4e7]" onClick={onRetake}>
        Retake
      </Button>
    </div>
  );
}
