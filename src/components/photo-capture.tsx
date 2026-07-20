"use client";

import { useRef } from "react";
import { Camera, Check, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { compressImage } from "@/lib/utils";

interface PhotoCaptureProps {
  label: string;
  hint?: string;
  value?: string;
  onCapture: (dataUrl: string) => void;
}

export function PhotoCapture({ label, hint, value, onCapture }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await compressImage(reader.result as string);
      onCapture(compressed);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h3 className="text-base font-semibold text-gray-900">{label}</h3>
        {hint && <p className="text-sm text-gray-500 mt-1">{hint}</p>}
      </div>

      {value ? (
        <div className="relative rounded-xl overflow-hidden border-2 border-green-400">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="w-full aspect-[4/3] object-cover" />
          <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
            <Check className="h-4 w-4" />
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="absolute bottom-2 right-2 bg-white/90 rounded-lg px-3 py-1.5 text-sm font-medium flex items-center gap-1 shadow"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retake
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-3 hover:border-brand-400 hover:bg-brand-50 transition-colors"
        >
          <div className="bg-brand-100 rounded-full p-4">
            <Camera className="h-8 w-8 text-brand-600" />
          </div>
          <span className="text-sm font-medium text-gray-600">Tap to take photo</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
