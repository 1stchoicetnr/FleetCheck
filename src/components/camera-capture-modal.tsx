"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Camera, AlertTriangle, RotateCw, Check } from "lucide-react";
import { Button } from "./ui/button";
import { PhotoFrameGuide } from "./photo-frame-guide";
import { PhotoExampleThumb } from "./photo-example-image";
import { PhotoStep } from "@/lib/types";
import { compressImage } from "@/lib/utils";
import { checkPhotoQuality, sampleVideoLowLight } from "@/lib/photo-quality";
import { useDeviceOrientation } from "@/hooks/use-orientation";
import { canUseBrowserCamera } from "@/lib/camera";

type Phase = "live" | "preview" | "fallback";

const LIVE_MEDIA_STYLE: React.CSSProperties = {
  width: "100vw",
  height: "100vh",
  objectFit: "cover",
  objectPosition: "center",
};

const PREVIEW_MEDIA_STYLE: React.CSSProperties = {
  width: "100vw",
  height: "100vh",
  objectFit: "contain",
  objectPosition: "center",
};

async function enterNativeFullscreen(el: HTMLElement): Promise<void> {
  try {
    if (document.fullscreenElement) return;
    const req =
      el.requestFullscreen?.bind(el) ??
      (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> })
        .webkitRequestFullscreen?.bind(el);
    if (req) await req();
  } catch {
    /* iOS Safari often blocks element fullscreen — fixed viewport still works */
  }
}

async function exitNativeFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) return;
    await document.exitFullscreen?.();
  } catch {
    /* ignore */
  }
}

function getVideoConstraints(facingMode: string, landscape: boolean) {
  return {
    facingMode: { ideal: facingMode },
    width: { ideal: landscape ? 1920 : 1080 },
    height: { ideal: landscape ? 1080 : 1920 },
    aspectRatio: { ideal: landscape ? 16 / 9 : 9 / 16 },
  };
}

function PreviewActions({
  onRetake,
  onAccept,
  disabled,
  failed,
  accepting,
}: {
  onRetake: () => void;
  onAccept: () => void;
  disabled: boolean;
  failed: boolean;
  accepting: boolean;
}) {
  if (accepting) {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10 px-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
        <div className="flex items-center justify-center gap-2 max-w-lg mx-auto h-16 rounded-2xl bg-green-600/90 text-white text-lg font-bold">
          <Check className="h-6 w-6" />
          Photo accepted — next step...
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10 px-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
        <button
          type="button"
          onClick={onRetake}
          className="w-full max-w-lg mx-auto h-16 rounded-2xl border-2 border-red-400 bg-red-950/70 text-red-300 text-lg font-bold active:scale-[0.98] transition-transform"
        >
          Retake Photo
        </button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10 px-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
      <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
        <button
          type="button"
          onClick={onRetake}
          className="h-16 rounded-2xl border-2 border-red-400 bg-red-950/70 text-red-300 text-lg font-bold active:scale-[0.98] transition-transform"
        >
          Retake
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          className="h-16 rounded-2xl bg-green-600 text-white text-lg font-bold active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
        >
          Use Photo
        </button>
      </div>
    </div>
  );
}

function CameraHeader({
  photoNumber,
  totalPhotos,
  label,
  instruction,
  onClose,
}: {
  photoNumber: number;
  totalPhotos: number;
  label: string;
  instruction?: string;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none bg-gradient-to-b from-black/90 via-black/55 to-transparent px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
      <div className="flex items-start gap-2 pointer-events-auto">
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-brand-300 text-xs font-bold tracking-wide uppercase">
            Photo {photoNumber} / {totalPhotos}
          </p>
          <h2 className="text-white text-lg sm:text-xl font-bold leading-tight drop-shadow-md">
            {label}
          </h2>
          {instruction && (
            <p className="text-white/90 text-sm mt-1 leading-snug drop-shadow max-w-[95%]">
              {instruction}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 p-2.5 rounded-full bg-black/40 text-white backdrop-blur-sm"
          aria-label="Close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

interface CameraCaptureModalProps {
  open: boolean;
  photoStep: PhotoStep;
  photoNumber: number;
  totalPhotos: number;
  onClose: () => void;
  onAccept: (dataUrl: string) => void;
}

export function CameraCaptureModal({
  open,
  photoStep,
  photoNumber,
  totalPhotos,
  onClose,
  onAccept,
}: CameraCaptureModalProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevLandscapeRef = useRef<boolean | null>(null);

  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("live");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [qualityPassed, setQualityPassed] = useState(true);
  const [qualityMessages, setQualityMessages] = useState<string[]>([]);
  const [qualityWarnings, setQualityWarnings] = useState<string[]>([]);
  const [checkingQuality, setCheckingQuality] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [autoAccepting, setAutoAccepting] = useState(false);
  const [liveLowLight, setLiveLowLight] = useState(false);

  const { isLandscape, version: orientationVersion } = useDeviceOrientation();

  const useRearCamera = photoStep.category !== "interior";
  const facingMode = useRearCamera ? "environment" : "user";
  const captureAttr = useRearCamera ? "environment" : "user";
  const showLandscapeTip = photoStep.category === "exterior";
  const liveCameraAvailable = canUseBrowserCamera();

  useEffect(() => setMounted(true), []);

  const syncLiveLayout = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.style.width = `${window.innerWidth}px`;
    video.style.height = `${window.innerHeight}px`;
    video.style.objectFit = "cover";
    video.style.objectPosition = "center";
    void video.offsetHeight;
  }, []);

  const syncPreviewLayout = useCallback(() => {
    const img = previewRef.current;
    if (!img) return;
    img.style.width = "100vw";
    img.style.height = "100vh";
    img.style.objectFit = "contain";
    img.style.objectPosition = "center";
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    try {
      screen.orientation?.unlock?.();
    } catch {
      /* ignore */
    }

    const root = viewportRef.current;
    if (root) void enterNativeFullscreen(root);

    return () => {
      document.body.style.overflow = prevOverflow;
      void exitNativeFullscreen();
      prevLandscapeRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (phase === "live") syncLiveLayout();
    if (phase === "preview") syncPreviewLayout();
  }, [open, phase, orientationVersion, syncLiveLayout, syncPreviewLayout]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const showPreview = async (dataUrl: string) => {
    const compressed = await compressImage(dataUrl, 1600, 0.82);
    setPreviewUrl(compressed);
    setPhase("preview");
    stopStream();
    setCheckingQuality(true);
    setQualityMessages([]);
    setQualityWarnings([]);
    const result = await checkPhotoQuality(compressed, photoStep.category);
    setQualityPassed(result.passed);
    setQualityMessages(result.messages);
    setQualityWarnings(result.warnings);
    setCheckingQuality(false);
    requestAnimationFrame(syncPreviewLayout);

    if (result.passed) {
      setAutoAccepting(true);
      setTimeout(() => {
        onAccept(compressed);
      }, 750);
    }
  };

  const startCamera = useCallback(async () => {
    stopStream();

    if (!liveCameraAvailable) {
      setPhase("fallback");
      return;
    }

    const landscape = window.innerWidth > window.innerHeight;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(facingMode, landscape),
        audio: false,
      });
      streamRef.current = stream;
      setPhase("live");

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        syncLiveLayout();
      }
    } catch {
      setPhase("fallback");
    }
  }, [facingMode, liveCameraAvailable, stopStream, syncLiveLayout]);

  useEffect(() => {
    if (!open) {
      stopStream();
      setPhase("live");
      setPreviewUrl(null);
      setQualityPassed(true);
      setQualityMessages([]);
      setQualityWarnings([]);
      setAutoAccepting(false);
      setLiveLowLight(false);
      return;
    }
    setPreviewUrl(null);
    setAutoAccepting(false);
    setLiveLowLight(false);
    startCamera();
    return stopStream;
  }, [open, photoStep.angle, startCamera, stopStream]);

  useEffect(() => {
    if (!open || phase !== "live") return;

    syncLiveLayout();

    if (
      prevLandscapeRef.current !== null &&
      prevLandscapeRef.current !== isLandscape
    ) {
      startCamera();
    }
    prevLandscapeRef.current = isLandscape;
  }, [open, phase, isLandscape, orientationVersion, startCamera, syncLiveLayout]);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d")!;
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      await showPreview(canvas.toDataURL("image/jpeg", 0.92));
    } finally {
      setCapturing(false);
    }
  };

  const handleNativeFile = async (file: File) => {
    setCapturing(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await showPreview(dataUrl);
    } finally {
      setCapturing(false);
    }
  };

  const retake = () => {
    setPreviewUrl(null);
    setQualityPassed(true);
    setQualityMessages([]);
    setQualityWarnings([]);
    setAutoAccepting(false);
    if (liveCameraAvailable) {
      setPhase("live");
      startCamera();
    } else {
      setPhase("fallback");
    }
  };

  useEffect(() => {
    if (!open || phase !== "live") return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        setLiveLowLight(sampleVideoLowLight(video));
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [open, phase, photoStep.angle]);

  const accept = () => {
    if (previewUrl && qualityPassed) onAccept(previewUrl);
  };

  const handleClose = () => {
    void exitNativeFullscreen();
    onClose();
  };

  const openNativeCamera = () => fileInputRef.current?.click();

  if (!open || !mounted) return null;

  const content = (
    <div ref={viewportRef} className="camera-viewport">
      {phase === "live" && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`camera-media z-0 ${
              facingMode === "user" ? "camera-media-mirror" : ""
            }`}
            style={LIVE_MEDIA_STYLE}
          />
          <PhotoFrameGuide
            category={photoStep.category}
            mode="fullscreen"
            className="photo-guide-overlay"
          />
          <PhotoExampleThumb
            angle={photoStep.angle}
            label={photoStep.label}
            className={
              isLandscape
                ? "absolute z-20 w-[8rem] h-[4.5rem] left-3 top-[max(5rem,env(safe-area-inset-top))]"
                : "absolute z-20 w-[7.5rem] h-[4.25rem] left-3 bottom-[calc(max(7rem,env(safe-area-inset-bottom))+1rem)]"
            }
          />
        </>
      )}

      {phase === "preview" && previewUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={previewRef}
            src={previewUrl}
            alt="Preview"
            className="camera-preview-media z-0"
            style={PREVIEW_MEDIA_STYLE}
          />
          {checkingQuality && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <p className="text-white text-lg font-medium">Checking photo quality...</p>
            </div>
          )}
        </>
      )}

      {phase === "fallback" && !previewUrl && (
        <>
          <div className="absolute inset-0 bg-[#060a08] z-0" />
          <PhotoFrameGuide
            category={photoStep.category}
            mode="fullscreen"
            className="photo-guide-overlay"
          />
          <PhotoExampleThumb
            angle={photoStep.angle}
            label={photoStep.label}
            className="absolute z-20 w-[7.5rem] h-[4.25rem] left-3 bottom-[calc(max(7.5rem,env(safe-area-inset-bottom))+5rem)]"
          />
          <CameraHeader
            photoNumber={photoNumber}
            totalPhotos={totalPhotos}
            label={photoStep.label}
            instruction={photoStep.instruction}
            onClose={handleClose}
          />

          {showLandscapeTip && (
            <div className="absolute left-0 right-0 z-20 px-4 bottom-[calc(max(7.5rem,env(safe-area-inset-bottom))+4.5rem)] pointer-events-none">
              <div className="flex items-center justify-center gap-2 mx-auto max-w-sm bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 border border-emerald-500/20">
                <RotateCw className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <p className="text-emerald-200/90 text-xs leading-snug text-center">
                  For best results, use landscape when photographing the vehicle
                </p>
              </div>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 z-30 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 px-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
            <p className="text-center text-emerald-400/50 text-xs mb-3">
              Match the green rectangle, then tap below
            </p>
            <Button
              size="xl"
              className="w-full max-w-lg mx-auto h-16 text-lg bg-brand-600 shadow-lg"
              onClick={openNativeCamera}
              disabled={capturing}
            >
              <Camera className="h-6 w-6 mr-2" />
              Open Camera App
            </Button>
            {liveCameraAvailable && (
              <button
                type="button"
                onClick={startCamera}
                className="block mx-auto mt-4 text-brand-300 text-sm underline"
              >
                Try live camera
              </button>
            )}
            {!liveCameraAvailable && (
              <p className="text-center text-white/35 text-xs mt-3">
                Live preview requires HTTPS — native camera works on Wi‑Fi
              </p>
            )}
          </div>
        </>
      )}

      {phase === "live" && (
        <CameraHeader
          photoNumber={photoNumber}
          totalPhotos={totalPhotos}
          label={photoStep.label}
          instruction={photoStep.instruction}
          onClose={handleClose}
        />
      )}

      {phase === "preview" && (
        <CameraHeader
          photoNumber={photoNumber}
          totalPhotos={totalPhotos}
          label={photoStep.label}
          onClose={handleClose}
        />
      )}

      {phase === "live" && liveLowLight && (
        <div className="absolute left-3 right-3 z-20 top-[max(5.5rem,env(safe-area-inset-top))] pointer-events-none">
          <div className="flex items-center gap-2 mx-auto max-w-sm bg-amber-950/75 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <p className="text-amber-100 text-sm leading-snug">
              Low light — hold steady and move closer if possible
            </p>
          </div>
        </div>
      )}

      {phase === "preview" && !qualityPassed && !checkingQuality && (
        <div className="absolute top-[max(4.5rem,env(safe-area-inset-top))] left-3 right-3 z-20 bg-red-600/95 text-white rounded-xl px-4 py-3 flex items-start gap-3 shadow-xl">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Photo did not pass quality check</p>
            {qualityMessages.map((msg) => (
              <p key={msg} className="text-sm text-red-100 mt-1">
                {msg}
              </p>
            ))}
            <p className="text-sm text-red-100 mt-2 font-medium">Please retake.</p>
          </div>
        </div>
      )}

      {phase === "preview" &&
        qualityPassed &&
        qualityWarnings.length > 0 &&
        !checkingQuality &&
        !autoAccepting && (
          <div className="absolute top-[max(4.5rem,env(safe-area-inset-top))] left-3 right-3 z-20 bg-amber-950/85 text-amber-100 rounded-xl px-4 py-3 flex items-start gap-3 shadow-xl border border-amber-500/25">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-amber-400" />
            <div>
              {qualityWarnings.map((msg) => (
                <p key={msg} className="text-sm">
                  {msg}
                </p>
              ))}
            </div>
          </div>
        )}

      {phase === "live" && (
        <div
          className={`absolute z-20 ${
            isLandscape
              ? "right-0 top-0 bottom-0 flex flex-col items-center justify-center gap-3 px-3 w-[5.5rem] bg-gradient-to-l from-black/80 via-black/45 to-transparent pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
              : "bottom-0 left-0 right-0 flex flex-col items-center bg-gradient-to-t from-black/85 via-black/50 to-transparent pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10 px-4"
          }`}
        >
          {!isLandscape && (
            <>
              {showLandscapeTip && (
                <p className="text-center text-emerald-400/80 text-xs mb-2 drop-shadow px-3">
                  Tip: rotate to landscape for vehicle photos
                </p>
              )}
              <p className="text-center text-white/80 text-sm mb-3 drop-shadow px-2">
                {photoStep.category === "interior"
                  ? "Center the subject in the green box"
                  : photoStep.category === "detail"
                  ? "Move closer — center the area in the green rectangle"
                  : "Step back — fit the whole vehicle inside the green rectangle"}
              </p>
            </>
          )}
          <button
            type="button"
            onClick={capturePhoto}
            disabled={capturing}
            className="flex items-center justify-center w-[4.75rem] h-[4.75rem] rounded-full bg-white ring-4 ring-white/30 active:scale-95 transition-transform disabled:opacity-50 shadow-lg"
            aria-label="Capture photo"
          >
            <div className="w-[3.75rem] h-[3.75rem] rounded-full border-[3px] border-gray-300 bg-white" />
          </button>
          {!isLandscape && (
            <p className="text-center text-white font-semibold text-base mt-2 drop-shadow">
              Capture
            </p>
          )}
        </div>
      )}

      {phase === "preview" && !autoAccepting && (
        <PreviewActions
          onRetake={retake}
          onAccept={accept}
          disabled={!qualityPassed || checkingQuality}
          failed={!qualityPassed && !checkingQuality}
          accepting={false}
        />
      )}

      {phase === "preview" && autoAccepting && (
        <PreviewActions
          onRetake={retake}
          onAccept={accept}
          disabled
          failed={false}
          accepting
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture={captureAttr}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleNativeFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );

  return createPortal(content, document.body);
}
