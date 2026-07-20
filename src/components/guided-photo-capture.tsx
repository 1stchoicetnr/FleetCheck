"use client";

import { useRef } from "react";
import { Camera, Check, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { ProgressBar } from "./ui/progress-bar";
import { compressImage } from "@/lib/utils";
import { PHOTO_ANGLES, PhotoAngle } from "@/lib/types";

interface GuidedPhotoCaptureProps {
  photos: Partial<Record<PhotoAngle, string>>;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onCapture: (angle: PhotoAngle, dataUrl: string) => void;
  onClear: (angle: PhotoAngle) => void;
}

export function GuidedPhotoCapture({
  photos,
  currentIndex,
  onIndexChange,
  onCapture,
  onClear,
}: GuidedPhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requiredPhotos = PHOTO_ANGLES.filter((p) => p.required);
  const current = requiredPhotos[currentIndex];
  const capturedCount = requiredPhotos.filter((p) => photos[p.angle]).length;
  const value = current ? photos[current.angle] : undefined;

  const handleFile = async (file: File) => {
    if (!current) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string);
      onCapture(current.angle, compressed);
    };
    reader.readAsDataURL(file);
  };

  const goNext = () => {
    if (currentIndex < requiredPhotos.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) onIndexChange(currentIndex - 1);
  };

  if (!current) return null;

  return (
    <div className="space-y-5">
      {/* Photo step progress */}
      <ProgressBar
        current={capturedCount}
        total={requiredPhotos.length}
        label={`Photos — ${capturedCount} of ${requiredPhotos.length} done`}
      />

      {/* Current step card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="text-center mb-4">
          <span className="inline-block bg-brand-100 text-brand-700 text-sm font-bold px-3 py-1 rounded-full mb-2">
            Photo {currentIndex + 1} of {requiredPhotos.length}
          </span>
          <h2 className="text-xl font-bold text-gray-900">{current.label}</h2>
          <p className="text-base text-gray-600 mt-2 leading-relaxed">
            {current.instruction}
          </p>
        </div>

        {/* Simple car diagram hint */}
        <div className="flex justify-center mb-4">
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl ${
              current.category === "exterior"
                ? "bg-blue-50"
                : "bg-amber-50"
            }`}
            aria-hidden
          >
            {current.icon}
          </div>
        </div>

        {value ? (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden border-2 border-green-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt={current.label}
                className="w-full aspect-[4/3] object-cover"
              />
              <div className="absolute top-3 left-3 bg-green-500 text-white rounded-full px-3 py-1 text-sm font-semibold flex items-center gap-1">
                <Check className="h-4 w-4" />
                Got it
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => {
                  onClear(current.angle);
                  inputRef.current?.click();
                }}
              >
                <RotateCcw className="h-5 w-5 mr-2" />
                Retake
              </Button>
              {currentIndex < requiredPhotos.length - 1 ? (
                <Button size="lg" className="w-full" onClick={goNext}>
                  Next Photo
                  <ChevronRight className="h-5 w-5 ml-1" />
                </Button>
              ) : (
                <Button size="lg" variant="secondary" className="w-full" disabled>
                  All done!
                </Button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 flex flex-col items-center justify-center gap-4 active:scale-[0.98] transition-transform"
          >
            <div className="bg-brand-600 rounded-full p-5">
              <Camera className="h-10 w-10 text-white" />
            </div>
            <span className="text-lg font-semibold text-brand-700">
              Tap to Take Photo
            </span>
          </button>
        )}
      </div>

      {/* Photo navigation dots */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="md"
          onClick={goPrev}
          disabled={currentIndex === 0}
          aria-label="Previous photo step"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <div className="flex gap-1.5 flex-wrap justify-center flex-1">
          {requiredPhotos.map((p, i) => (
            <button
              key={p.angle}
              type="button"
              onClick={() => onIndexChange(i)}
              title={p.label}
              className={`min-w-[36px] h-9 px-2 rounded-lg text-xs font-bold transition-colors ${
                photos[p.angle]
                  ? "bg-green-500 text-white"
                  : i === currentIndex
                  ? "bg-brand-600 text-white ring-2 ring-brand-300"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {photos[p.angle] ? "✓" : i + 1}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="md"
          onClick={goNext}
          disabled={currentIndex === requiredPhotos.length - 1}
          aria-label="Next photo step"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
