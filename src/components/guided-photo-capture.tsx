"use client";

import { useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  RotateCw,
  Video,
} from "lucide-react";
import { Button } from "./ui/button";
import { ProgressBar } from "./ui/progress-bar";
import { CameraCaptureModal } from "./camera-capture-modal";
import { PhotoExampleCard } from "./photo-example-image";
import { compressImageFile } from "@/lib/utils";
import { PHOTO_ANGLES, PhotoAngle, PhotoStep } from "@/lib/types";

interface GuidedPhotoCaptureProps {
  photos: Partial<Record<PhotoAngle, string>>;
  onAccept: (angle: PhotoAngle, dataUrl: string) => void;
  onClear: (angle: PhotoAngle) => void;
  onAllComplete: () => void;
  /** Dev: browse all steps without requiring captures */
  testingBrowseMode?: boolean;
  /** Company checklist. Defaults to the 30-step policy. */
  steps?: PhotoStep[];
  testingFinishLabel?: string;
  allCompleteMessage?: string;
}

export function GuidedPhotoCapture({
  photos,
  onAccept,
  onClear,
  onAllComplete,
  testingBrowseMode = false,
  steps = PHOTO_ANGLES,
  testingFinishLabel = "Finish preview → Mileage",
  allCompleteMessage = "All photos accepted — moving to mileage...",
}: GuidedPhotoCaptureProps) {
  const requiredPhotos = steps.filter((p) => p.required);
  const acceptedCount = requiredPhotos.filter((p) => photos[p.angle]).length;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const firstIncompleteIndex = useMemo(() => {
    const idx = requiredPhotos.findIndex((p) => !photos[p.angle]);
    return idx === -1 ? requiredPhotos.length - 1 : idx;
  }, [photos, requiredPhotos]);

  const [viewIndex, setViewIndex] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState("");

  const currentIndex = testingBrowseMode
    ? viewIndex
    : Math.min(viewIndex, firstIncompleteIndex);
  const current = requiredPhotos[currentIndex];
  const allComplete = acceptedCount === requiredPhotos.length;
  const value = current ? photos[current.angle] : undefined;
  const isExterior = current?.category === "exterior";
  const isLastStep = currentIndex === requiredPhotos.length - 1;

  const handleAccept = (dataUrl: string) => {
    if (!current) return;
    onAccept(current.angle, dataUrl);
    setCameraOpen(false);
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
    setBusy(true);
    setPickError("");
    try {
      const compressed = await compressImageFile(file);
      handleAccept(compressed);
    } catch {
      setPickError("Couldn't use that photo. Try Take photo again.");
    } finally {
      setBusy(false);
    }
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

  const openGallery = () => {
    if (!current || value || busy) return;
    galleryInputRef.current?.click();
  };

  const openLivePreview = () => {
    if (!current || value) return;
    setCameraOpen(true);
  };

  const retakeAccepted = () => {
    if (!current) return;
    onClear(current.angle);
    setPickError("");
  };

  if (!current) return null;

  return (
    <div className="space-y-5">
      <ProgressBar
        current={testingBrowseMode ? currentIndex + 1 : acceptedCount}
        total={requiredPhotos.length}
        label={
          testingBrowseMode
            ? `Preview — step ${currentIndex + 1} of ${requiredPhotos.length}`
            : `Photos — ${acceptedCount} of ${requiredPhotos.length} accepted`
        }
      />

      {testingBrowseMode && (
        <p className="text-center text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg py-2 px-3">
          <strong>For testing only.</strong> Browse all 30 steps — tap{" "}
          <strong>Next step (no photo)</strong> or jump using the numbers below.
        </p>
      )}

      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-lg">
        <div className="px-5 pt-5 pb-4 border-b border-gray-800">
          <span className="inline-block bg-emerald-500/15 text-emerald-300 text-sm font-bold px-3 py-1 rounded-full mb-2">
            Photo {currentIndex + 1} of {requiredPhotos.length}
          </span>
          <h2 className="text-xl font-bold text-white">{current.label}</h2>
          <p className="text-base text-gray-300 mt-2 leading-relaxed">
            {current.instruction}
          </p>
          {current.helper && (
            <p className="mt-2 text-sm text-amber-200/90 leading-relaxed bg-amber-950/40 border border-amber-700/40 rounded-lg px-3 py-2">
              {current.helper}
            </p>
          )}
          {isExterior && (
            <p className="flex items-center gap-1.5 text-emerald-400/80 text-xs mt-2.5">
              <RotateCw className="h-3.5 w-3.5 flex-shrink-0" />
              Use landscape when photographing the vehicle
            </p>
          )}
        </div>

        {value ? (
          <div className="p-4 space-y-4">
            <div className="relative rounded-xl overflow-hidden border-2 border-emerald-500/60 bg-black flex items-center justify-center min-h-[180px] max-h-[min(55vh,360px)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt={current.label}
                className="w-full h-full max-h-[min(55vh,360px)] object-contain"
              />
              <div className="absolute top-3 left-3 bg-emerald-600 text-white rounded-full px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5 shadow">
                <Check className="h-4 w-4" />
                Accepted
              </div>
            </div>
            <Button
              variant="outline"
              size="lg"
              className="w-full border-red-400/50 text-red-300 bg-red-950/30 hover:bg-red-950/50"
              onClick={retakeAccepted}
            >
              Retake This Photo
            </Button>
            {testingBrowseMode && (
              <Button size="lg" className="w-full" onClick={advanceWithoutPhoto}>
                {isLastStep ? testingFinishLabel : "Next step"}
                <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <PhotoExampleCard
              angle={current.angle}
              label={current.label}
              category={current.category}
            />
            <p className="text-center text-xs text-gray-500">
              Match the example, then take the photo with your phone camera
            </p>

            {pickError && (
              <p className="text-center text-sm text-red-300 font-medium">
                {pickError}
              </p>
            )}

            {testingBrowseMode && (
              <Button size="lg" className="w-full" onClick={advanceWithoutPhoto}>
                {isLastStep ? testingFinishLabel : "Next step (no photo)"}
                <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            )}

            <button
              type="button"
              onClick={openNativeCamera}
              disabled={busy}
              className="w-full h-16 rounded-2xl bg-brand-600 hover:bg-brand-500 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-3 text-white font-bold text-lg disabled:opacity-60"
            >
              <Camera className="h-7 w-7" />
              {busy ? "Saving photo…" : "Take photo"}
            </button>
            <button
              type="button"
              onClick={openLivePreview}
              className="w-full h-12 rounded-xl border border-gray-600 text-gray-200 text-sm font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              <Video className="h-4 w-4" />
              Live preview
            </button>
            <button
              type="button"
              onClick={openGallery}
              disabled={busy}
              className="w-full text-gray-400 text-sm underline py-1 flex items-center justify-center gap-1.5"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Choose from library
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {(currentIndex > 0 || testingBrowseMode) && currentIndex > 0 && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setViewIndex(currentIndex - 1)}
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
          {requiredPhotos.map((p, i) => {
            const done = !!photos[p.angle];
            const isCurrent = i === currentIndex;
            const canView =
              testingBrowseMode || done || i === firstIncompleteIndex;
            return (
              <button
                key={p.angle}
                type="button"
                disabled={!canView}
                onClick={() => canView && setViewIndex(i)}
                title={p.label}
                className={`flex-shrink-0 min-w-[32px] h-8 px-1.5 rounded-md text-[10px] font-bold transition-colors ${
                  done
                    ? "bg-emerald-600 text-white"
                    : isCurrent
                    ? "bg-brand-600 text-white ring-2 ring-brand-300"
                    : testingBrowseMode
                    ? "bg-gray-300 text-gray-700"
                    : "bg-gray-200 text-gray-400"
                } ${!canView ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {done ? "✓" : i + 1}
              </button>
            );
          })}
        </div>

        {testingBrowseMode && !isLastStep && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => setViewIndex(currentIndex + 1)}
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
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handlePickedFile(file);
          e.target.value = "";
        }}
      />

      <CameraCaptureModal
        open={cameraOpen}
        photoStep={current}
        photoNumber={currentIndex + 1}
        totalPhotos={requiredPhotos.length}
        onClose={() => setCameraOpen(false)}
        onAccept={handleAccept}
      />
    </div>
  );
}
