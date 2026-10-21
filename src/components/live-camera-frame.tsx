"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { framingForAngle } from "@/lib/photo-guides";
import type { PhotoAngle } from "@/lib/types";
import { FramingOutline } from "./framing-outline";
import { primaryButtonClass } from "@/lib/button-styles";

export function LiveCameraFrame({
  angle,
  busy,
  onCapture,
  onUnavailable,
}: {
  angle: PhotoAngle;
  busy: boolean;
  onCapture: (file: File) => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;
  const [ready, setReady] = useState(false);
  const guide = framingForAngle(angle);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        unavailableRef.current();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) unavailableRef.current();
      }
    }
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], "capture.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl bg-black aspect-[4/3]">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
          aria-label="Live camera"
        />
        <FramingOutline style={guide.style} kind={guide.kind} />
      </div>
      <p className="text-sm text-amber-100/90 leading-relaxed">{guide.tip}</p>
      <button
        type="button"
        onClick={capture}
        disabled={!ready || busy}
        className={`photo-take-btn w-full h-16 rounded-2xl active:scale-[0.98] transition-all shadow-card flex items-center justify-center gap-3 font-bold text-lg ${primaryButtonClass}`}
      >
        <Camera className="h-7 w-7" />
        {busy ? "Saving photo…" : ready ? "Capture" : "Starting camera…"}
      </button>
    </div>
  );
}
