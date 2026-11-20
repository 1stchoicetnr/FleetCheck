"use client";

import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { CarDiagram } from "./car-diagram";
import { compressImageFile } from "@/lib/utils";
import { isUsableImageDataUrl, MAX_QUEUED_PHOTO_CHARS } from "@/lib/canvas-safe";
import { isLibraryPhoto, LIBRARY_PHOTO_MESSAGE } from "@/lib/odometer-match";
import { stampPhotoDataUrl } from "@/lib/photo-stamp";
import { damageSpotLabel, type DamageSpot } from "@/lib/damage-closeup";

/** Required for flagged damage: tap the spot on the car, then take a close-up. */
export function DamageCloseUpPanel({
  label,
  spot,
  closeUp,
  onSpot,
  onCloseUp,
  onRetakeCloseUp,
}: {
  label: string;
  spot?: DamageSpot;
  closeUp?: string;
  onSpot: (spot: DamageSpot) => void;
  onCloseUp: (dataUrl: string) => void;
  onRetakeCloseUp: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(file: File) {
    if (isLibraryPhoto(file.lastModified, Date.now())) {
      setError(LIBRARY_PHOTO_MESSAGE);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const compressed = await compressImageFile(file);
      if (!isUsableImageDataUrl(compressed) || compressed.length > MAX_QUEUED_PHOTO_CHARS) {
        setError("Could not save that photo. Take it again.");
        return;
      }
      let stamped = compressed;
      try {
        stamped = await stampPhotoDataUrl(compressed, new Date().toISOString());
      } catch {
        // keep unstamped
      }
      onCloseUp(stamped);
    } catch {
      setError("Could not use that photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const where = damageSpotLabel(spot);
  return (
    <div className="space-y-3 rounded-xl border-2 border-red-500 bg-red-950/30 p-3" data-testid="damage-closeup">
      <p className="text-base font-bold text-red-100">Damage on {label.toLowerCase()}: two more steps</p>
      <div className="flex gap-3 items-start">
        <div className="rounded-lg bg-[#121214] p-2">
          <CarDiagram spot={spot} onSpot={onSpot} size={170} dark />
        </div>
        <div className="flex-1 space-y-2 text-sm text-[#e4e4e7]">
          <p>
            <span className="font-semibold">1. Tap where the damage is</span> on the car.
            {where ? <span className="block text-red-200">Marked: {where} ✓</span> : null}
          </p>
          <p>
            <span className="font-semibold">2. Take a close-up</span> of the damage (fill the frame).
          </p>
          {closeUp ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={closeUp} alt={`${label} close-up`} className="w-full max-h-40 object-contain rounded-lg border border-red-400/60 bg-black" />
              <button type="button" className="text-xs font-semibold underline text-red-200" onClick={onRetakeCloseUp}>
                Retake close-up
              </button>
            </div>
          ) : (
            <Button type="button" size="lg" className="w-full" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Saving…" : "Take close-up"}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-sm font-medium text-red-300">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
