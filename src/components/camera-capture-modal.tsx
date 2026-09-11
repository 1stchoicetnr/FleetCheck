"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Camera,
  AlertTriangle,
  RotateCw,
  Check,
  SwitchCamera,
  Flashlight,
  FlashlightOff,
} from "lucide-react";
import { Button } from "./ui/button";
import { PhotoFrameGuide } from "./photo-frame-guide";
import { PhotoExampleThumb } from "./photo-example-image";
import { PhotoStep } from "@/lib/types";
import { compressUploadPhoto, fileToDataUrl } from "@/lib/utils";
import { checkPhotoQuality, sampleVideoLowLight } from "@/lib/photo-quality";
import { useDeviceOrientation } from "@/hooks/use-orientation";
import {
  CameraFacing,
  applyDesiredTorch,
  applyTorchAndKeepPreview,
  bindStreamToVideo,
  canUseBrowserCamera,
  describeGetUserMediaError,
  describeTorchUnavailable,
  getSessionCameraFacing,
  getStreamVideoTrack,
  isLikelyIOS,
  isPreviewLive,
  openCameraStream,
  probeTorchSupport,
  setSessionCameraFacing,
  trackSupportsTorch,
  waitForElement,
  waitForVideoFrame,
} from "@/lib/camera";

type Phase = "native" | "live" | "preview";

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

function FlipCameraButton({
  facingMode,
  onFlip,
  compact = false,
}: {
  facingMode: CameraFacing;
  onFlip: () => void;
  compact?: boolean;
}) {
  const label =
    facingMode === "environment" ? "Flip to front camera" : "Flip to rear camera";
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={label}
      className={
        compact
          ? "flex flex-col items-center justify-center gap-1 min-h-[52px] min-w-[52px] px-1 text-white drop-shadow"
          : "inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-full bg-black/60 text-white border border-white/35 backdrop-blur-sm font-semibold text-sm active:scale-[0.98]"
      }
    >
      <SwitchCamera className={compact ? "h-7 w-7" : "h-5 w-5"} />
      <span className={compact ? "text-[11px] font-semibold leading-tight text-center" : ""}>
        Flip Camera
      </span>
    </button>
  );
}

function FlashlightButton({
  on,
  supported,
  onToggle,
  compact = false,
  unavailableHint,
}: {
  on: boolean;
  supported: boolean;
  onToggle: () => void;
  compact?: boolean;
  unavailableHint?: string;
}) {
  const Icon = on ? Flashlight : FlashlightOff;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={!supported}
        aria-pressed={on}
        aria-label={
          supported
            ? on
              ? "Turn flashlight off"
              : "Turn flashlight on"
            : "Flashlight not available"
        }
        className={
          compact
            ? `flex flex-col items-center justify-center gap-1 min-h-[52px] min-w-[52px] px-1 drop-shadow ${
                supported
                  ? on
                    ? "text-amber-300"
                    : "text-white"
                  : "text-white/40"
              }`
            : `inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-full border backdrop-blur-sm font-semibold text-sm active:scale-[0.98] ${
                supported
                  ? on
                    ? "bg-amber-400 text-black border-amber-200"
                    : "bg-black/60 text-white border-white/35"
                  : "bg-black/40 text-white/45 border-white/15 cursor-not-allowed"
              }`
        }
      >
        <Icon className={compact ? "h-7 w-7" : "h-5 w-5"} />
        <span className={compact ? "text-[11px] font-semibold leading-tight text-center" : ""}>
          Flashlight
        </span>
      </button>
      {!supported && (
        <p className="text-[11px] text-white/70 text-center max-w-[14rem] leading-tight px-1">
          {unavailableHint ||
            (compact ? "Not available" : "Flashlight not available on this phone")}
        </p>
      )}
    </div>
  );
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
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Session torch intent — survives orientation until close or toggle-off. */
  const torchDesiredRef = useRef(false);
  const startGenRef = useRef(0);
  const startCameraRef = useRef<() => Promise<void>>(async () => {});
  const openRef = useRef(open);

  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("native");
  const [liveError, setLiveError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [qualityPassed, setQualityPassed] = useState(true);
  const [qualityMessages, setQualityMessages] = useState<string[]>([]);
  const [qualityWarnings, setQualityWarnings] = useState<string[]>([]);
  const [checkingQuality, setCheckingQuality] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [autoAccepting, setAutoAccepting] = useState(false);
  const [liveLowLight, setLiveLowLight] = useState(false);

  const { isLandscape, version: orientationVersion } = useDeviceOrientation();

  const [facingMode, setFacingMode] = useState<CameraFacing>("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const showLandscapeTip = photoStep.category === "exterior";

  openRef.current = open;

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
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (phase === "live") syncLiveLayout();
    if (phase === "preview") syncPreviewLayout();
  }, [open, phase, orientationVersion, syncLiveLayout, syncPreviewLayout]);

  const stopStream = useCallback((opts?: { resetTorch?: boolean }) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (opts?.resetTorch) {
      torchDesiredRef.current = false;
      setTorchOn(false);
      setTorchSupported(false);
    }
  }, []);

  const finishCapture = async (dataUrl: string) => {
    const compressed = await compressUploadPhoto(dataUrl);
    setPreviewUrl(compressed);
    setPhase("preview");
    startGenRef.current += 1;
    stopStream();
    setAutoAccepting(true);
    setQualityPassed(true);
    setCheckingQuality(true);
    const result = await checkPhotoQuality(compressed, photoStep.category);
    setQualityWarnings(result.passed ? result.warnings : result.messages);
    setCheckingQuality(false);
    requestAnimationFrame(syncPreviewLayout);
    window.setTimeout(() => onAccept(compressed), 450);
  };

  const startCamera = useCallback(async () => {
    const gen = ++startGenRef.current;
    stopStream();
    setLiveError("");

    if (!canUseBrowserCamera()) {
      setLiveError(describeGetUserMediaError(undefined));
      setPhase("native");
      return;
    }

    const facing = getSessionCameraFacing();

    try {
      const stream = await openCameraStream(facing);
      if (gen !== startGenRef.current || !openRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      setFacingMode(facing);
      setPhase("live");

      const video = await waitForElement(() => videoRef.current);
      if (gen !== startGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const previewOk = await bindStreamToVideo(video, stream);
      syncLiveLayout();
      if (!previewOk) {
        setLiveError("Couldn't show the camera preview. Try Live preview again, or use Take photo.");
      }

      const track = getStreamVideoTrack(stream);
      const recoverPreview = () => {
        if (gen !== startGenRef.current) return;
        if (streamRef.current !== stream) return;
        if (track && track.readyState !== "live") return;
        const el = videoRef.current;
        if (!el) return;
        if (el.srcObject !== stream) el.srcObject = stream;
        if (el.paused) void el.play().catch(() => {});
      };
      track?.addEventListener("mute", recoverPreview);
      track?.addEventListener("unmute", recoverPreview);
      track?.addEventListener("ended", () => {
        if (streamRef.current !== stream) return;
        void startCameraRef.current();
      });

      const torchOk =
        facing === "environment" && (await probeTorchSupport(track));
      if (gen !== startGenRef.current) return;
      setTorchSupported(torchOk);

      if (torchDesiredRef.current && torchOk) {
        const result = await applyDesiredTorch(track, true);
        if (gen !== startGenRef.current) return;
        setTorchOn(result.on);
        await bindStreamToVideo(videoRef.current, stream, true);
        if (!isPreviewLive(videoRef.current)) {
          torchDesiredRef.current = false;
          setTorchOn(false);
          const recovered = await applyTorchAndKeepPreview(
            track,
            videoRef.current,
            stream,
            false
          );
          if (!recovered.previewLive) {
            setPhase("native");
            startGenRef.current += 1;
            stopStream();
            setLiveError(
              "Live preview stopped after flashlight. Use Take photo instead."
            );
            return;
          }
          setLiveError(
            "Flashlight froze the preview on this phone, so it was turned off. Use Take photo and Camera flash instead."
          );
        }
      } else {
        setTorchOn(false);
      }
    } catch (err) {
      if (gen !== startGenRef.current) return;
      setLiveError(describeGetUserMediaError(err));
      setPhase("native");
      setTorchSupported(false);
      setTorchOn(false);
    }
  }, [stopStream, syncLiveLayout]);

  startCameraRef.current = startCamera;

  useLayoutEffect(() => {
    if (phase !== "live") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
    syncLiveLayout();
  }, [phase, syncLiveLayout]);

  useEffect(() => {
    if (!open) {
      startGenRef.current += 1;
      stopStream({ resetTorch: true });
      setPhase("native");
      setPreviewUrl(null);
      setQualityPassed(true);
      setQualityMessages([]);
      setQualityWarnings([]);
      setAutoAccepting(false);
      setLiveLowLight(false);
      setLiveError("");
      return;
    }
    setFacingMode(getSessionCameraFacing());
    setPreviewUrl(null);
    setAutoAccepting(false);
    setLiveLowLight(false);
    setLiveError("");
    void startCamera();
    return () => {
      startGenRef.current += 1;
      stopStream();
    };
  }, [open, photoStep.angle, startCamera, stopStream]);

  const flipCamera = () => {
    const next: CameraFacing =
      getSessionCameraFacing() === "environment" ? "user" : "environment";
    if (next === "user") {
      torchDesiredRef.current = false;
      setTorchOn(false);
      setTorchSupported(false);
    }
    setSessionCameraFacing(next);
    setFacingMode(next);
    if (open && (phase === "live" || phase === "native")) {
      void startCamera();
    }
  };

  const toggleTorch = async () => {
    const stream = streamRef.current;
    const track = getStreamVideoTrack(stream);
    const video = videoRef.current;
    if (!stream || !track) return;

    if (facingMode === "user" || !trackSupportsTorch(track)) {
      setTorchSupported(false);
      torchDesiredRef.current = false;
      setTorchOn(false);
      return;
    }

    const next = !torchDesiredRef.current;
    torchDesiredRef.current = next;
    const result = await applyTorchAndKeepPreview(track, video, stream, next);

    if (result.applied && result.previewLive) {
      setTorchOn(next);
      setTorchSupported(true);
      setLiveError("");
      return;
    }

    torchDesiredRef.current = false;
    setTorchOn(false);
    setTorchSupported(result.supported);
    if (!result.previewLive) {
      await bindStreamToVideo(video, stream, true);
      if (!isPreviewLive(videoRef.current)) {
        setPhase("native");
        startGenRef.current += 1;
        stopStream();
        setLiveError("Live preview stopped after flashlight. Use Take photo instead.");
        return;
      }
      setLiveError(
        "Flashlight froze the camera preview, so it was turned off. Use Take photo and Camera flash instead."
      );
    } else if (result.rolledBack || next) {
      setLiveError(
        result.rolledBack
          ? "Flashlight froze the camera preview, so it was turned off. Use Take photo and Camera flash instead."
          : describeTorchUnavailable()
      );
    }
  };

  useEffect(() => {
    if (!open || phase !== "live") return;
    syncLiveLayout();
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (video.paused) void video.play().catch(() => {});
  }, [open, phase, isLandscape, orientationVersion, syncLiveLayout]);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || capturing) return;
    setCapturing(true);
    setLiveError("");
    try {
      const ready = await waitForVideoFrame(video);
      if (!ready) {
        setLiveError("Couldn't capture a frame. Use Take photo instead.");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      if (facingMode === "user") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      await finishCapture(canvas.toDataURL("image/jpeg", 0.92));
    } finally {
      setCapturing(false);
    }
  };

  const handlePickedFile = async (file: File) => {
    setCapturing(true);
    setLiveError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      await finishCapture(dataUrl);
    } catch {
      setLiveError("Couldn't read that photo. Try Take photo again.");
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
    setPhase("native");
    fileInputRef.current?.click();
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
    <div
      ref={viewportRef}
      className="camera-viewport"
      data-camera-facing={facingMode}
      data-capture-phase={phase}
      data-torch-supported={torchSupported ? "true" : "false"}
      data-torch-on={torchOn ? "true" : "false"}
    >
      {phase !== "preview" && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`camera-media z-0 ${
            facingMode === "user" ? "camera-media-mirror" : ""
          }`}
          style={{
            ...LIVE_MEDIA_STYLE,
            opacity: phase === "live" ? 1 : 0,
            pointerEvents: "none",
          }}
        />
      )}

      {phase === "live" && (
        <>
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
              <p className="text-white text-lg font-medium">Saving photo…</p>
            </div>
          )}
        </>
      )}

      {phase === "live" && liveError && (
        <div className="absolute left-3 right-3 z-30 top-[max(5.5rem,env(safe-area-inset-top))]">
          <div className="flex items-start gap-2 mx-auto max-w-sm bg-red-950/90 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-red-500/40">
            <AlertTriangle className="h-4 w-4 text-red-300 flex-shrink-0 mt-0.5" />
            <p className="text-red-50 text-sm leading-snug">{liveError}</p>
          </div>
        </div>
      )}

      {phase === "native" && !previewUrl && (
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
            {liveError && (
              <p className="text-center text-red-200 text-sm font-medium mb-3 px-2">
                {liveError}
              </p>
            )}
            <p className="text-center text-emerald-400/50 text-xs mb-3">
              Match the example, then take the photo
            </p>
            <Button
              size="xl"
              className="w-full max-w-lg mx-auto h-16 text-lg bg-brand-600 shadow-lg"
              onClick={openNativeCamera}
              disabled={capturing}
            >
              <Camera className="h-6 w-6 mr-2" />
              Take photo
            </Button>
            <p className="text-center text-white/70 text-xs mt-3 mb-1 px-2 leading-snug">
              Need a flashlight for a dark shot? Take photo only has your phone’s
              one-shot flash. Use Live preview for a continuous flashlight.
            </p>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="flex items-center justify-center gap-2 mx-auto mt-2 min-h-[44px] px-4 rounded-full bg-black/50 text-amber-200 border border-amber-400/40 text-sm font-semibold"
            >
              <Flashlight className="h-4 w-4" />
              Live preview + flashlight
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="block mx-auto mt-3 text-white/45 text-sm underline"
            >
              Choose from library
            </button>
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
              {torchSupported
                ? "Low light — turn on Flashlight"
                : isLikelyIOS()
                  ? "Low light — use Take photo and Camera flash, or the Control Center torch"
                  : "Low light — use Take photo and Camera flash if flashlight isn’t available"}
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
        qualityWarnings.length > 0 &&
        !checkingQuality && (
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
              ? "right-0 top-0 bottom-0 flex flex-col items-center justify-center gap-3 px-2 w-[6.25rem] bg-gradient-to-l from-black/80 via-black/45 to-transparent pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
              : "bottom-0 left-0 right-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10 px-4"
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
          <div
            className={
              isLandscape
                ? "flex flex-col items-center gap-3"
                : "flex flex-wrap items-start justify-center gap-2"
            }
          >
            <FlipCameraButton
              facingMode={facingMode}
              onFlip={flipCamera}
              compact={isLandscape}
            />
            <FlashlightButton
              on={torchOn}
              supported={torchSupported && facingMode === "environment"}
              onToggle={() => void toggleTorch()}
              compact={isLandscape}
              unavailableHint={
                isLandscape
                  ? isLikelyIOS()
                    ? "Use Take photo flash"
                    : "Not available"
                  : describeTorchUnavailable()
              }
            />
          </div>
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
          <button
            type="button"
            onClick={openNativeCamera}
            className="text-white/70 text-xs underline mt-1"
          >
            Use phone camera instead
          </button>
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
    </div>
  );

  return createPortal(content, document.body);
}
