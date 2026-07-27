"use client";

import { useMemo, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, RotateCw, Smartphone } from "lucide-react";
import { Button } from "./ui/button";
import { ProgressBar } from "./ui/progress-bar";
import { CameraCaptureModal } from "./camera-capture-modal";
import { PhotoExampleCard } from "./photo-example-image";
import { canUseBrowserCamera } from "@/lib/camera";
import { PHOTO_ANGLES, PhotoAngle } from "@/lib/types";

interface GuidedPhotoCaptureProps {
  photos: Partial<Record<PhotoAngle, string>>;
  onAccept: (angle: PhotoAngle, dataUrl: string) => void;
  onClear: (angle: PhotoAngle) => void;
  onAllComplete: () => void;
  /** Dev: browse all steps without requiring captures */
  testingBrowseMode?: boolean;
}

export function GuidedPhotoCapture({
  photos,
  onAccept,
  onClear,
  onAllComplete,
  testingBrowseMode = false,
}: GuidedPhotoCaptureProps) {
  const requiredPhotos = PHOTO_ANGLES.filter((p) => p.required);
  const acceptedCount = requiredPhotos.filter((p) => photos[p.angle]).length;
  const liveCamera = canUseBrowserCamera();

  const firstIncompleteIndex = useMemo(() => {
    const idx = requiredPhotos.findIndex((p) => !photos[p.angle]);
    return idx === -1 ? requiredPhotos.length - 1 : idx;
  }, [photos, requiredPhotos]);

  const [viewIndex, setViewIndex] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);

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

    if (isLastStep) {
      setTimeout(() => onAllComplete(), 400);
    } else if (!testingBrowseMode) {
      setTimeout(() => {
        setViewIndex(currentIndex + 1);
        setCameraOpen(true);
      }, 350);
    } else {
      setTimeout(() => setViewIndex(currentIndex + 1), 300);
    }
  };

  const advanceWithoutPhoto = () => {
    if (isLastStep) {
      onAllComplete();
    } else {
      setViewIndex(currentIndex + 1);
    }
  };

  const openCamera = () => {
    if (!current || value) return;
    setCameraOpen(true);
  };

  const retakeAccepted = () => {
    if (!current) return;
    onClear(current.angle);
    setCameraOpen(true);
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
                {isLastStep ? "Finish preview → Mileage" : "Next step"}
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
              {testingBrowseMode
                ? "Example above — open camera only if you want to test capture"
                : "Open the camera to see the green rectangle guide while you shoot"}
            </p>

            {!testingBrowseMode && (
              <>
                <button
                  type="button"
                  onClick={openCamera}
                  className="w-full h-16 rounded-2xl bg-brand-600 hover:bg-brand-500 active:scale-[0.98] transition-all shadow-lg flex items-center justify-center gap-3 text-white font-bold text-lg"
                >
                  <Camera className="h-7 w-7" />
                  {liveCamera ? "Open Camera" : "Open Camera App"}
                </button>
                {!liveCamera && (
                  <p className="text-center text-gray-500 text-xs flex items-center justify-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5" />
                    Uses your phone&apos;s native camera on Wi‑Fi
                  </p>
                )}
              </>
            )}

            {testingBrowseMode && (
              <div className="space-y-2">
                <Button size="lg" className="w-full" onClick={advanceWithoutPhoto}>
                  {isLastStep ? "Finish preview → Mileage" : "Next step (no photo)"}
                  <ChevronRight className="h-5 w-5 ml-1" />
                </Button>
                <button
                  type="button"
                  onClick={openCamera}
                  className="w-full h-12 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="h-4 w-4" />
                  Try camera anyway
                </button>
              </div>
            )}
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
          All photos accepted — moving to mileage...
        </p>
      )}

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
