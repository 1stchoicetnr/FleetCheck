"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Camera,
  AlertTriangle,
  Check,
  SwitchCamera,
  Flashlight,
  FlashlightOff,
} from "lucide-react";
import { Button } from "./ui/button";
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
  isLikelyAndroid,
  isLikelyIOS,
  isPreviewLive,
  openCameraStream,
  probeTorchSupport,
  setSessionCameraFacing,
  waitForElement,
  waitForVideoFrame,
} from "@/lib/camera";
import { restoreNaturalOrientation } from "@/lib/orientation";
import { CheckoutFeedbackButton } from "@/components/checkout-feedback";

type Phase = "native" | "live" | "preview";

function FlashlightControl({
  on,
  available,
  onToggle,
}: {
  on: boolean;
  available: boolean;
  onToggle: () => void;
}) {
  if (!available) {
    return (
      <p className="camera-torch-fallback text-center text-xs text-white/75 leading-snug px-2 max-w-[14rem]">
        {describeTorchUnavailable()}
      </p>
    );
  }

  const Icon = on ? Flashlight : FlashlightOff;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "Turn flashlight off" : "Turn flashlight on"}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-full border font-semibold text-sm ${
        on
          ? "bg-amber-400 text-black border-amber-200"
          : "bg-black/50 text-white border-white/35"
      }`}
    >
      <Icon className="h-5 w-5" />
      {on ? "Flashlight on" : "Flashlight"}
    </button>
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const torchDesiredRef = useRef(false);
  const startGenRef = useRef(0);
  const startCameraRef = useRef<() => Promise<void>>(async () => {});
  const openRef = useRef(open);

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
  const [facingMode, setFacingMode] = useState<CameraFacing>("environment");
  const [torchOn, setTorchOn] = useState(false);
  /** null = still probing / Android may still toggle; false = show fallback */
  const [torchAvailable, setTorchAvailable] = useState<boolean | null>(null);

  const { version: orientationVersion } = useDeviceOrientation();
  openRef.current = open;

  const fitMedia = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = "cover";
    }
    const img = previewRef.current;
    if (img) {
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "contain";
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void restoreNaturalOrientation();
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const kickNativeFullscreen = () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", kickNativeFullscreen);

    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
      document.removeEventListener("fullscreenchange", kickNativeFullscreen);
      void restoreNaturalOrientation();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fitMedia();
  }, [open, phase, orientationVersion, fitMedia]);

  const stopStream = useCallback((opts?: { resetTorch?: boolean }) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (opts?.resetTorch) {
      torchDesiredRef.current = false;
      setTorchOn(false);
      setTorchAvailable(null);
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
    requestAnimationFrame(fitMedia);
    window.setTimeout(() => onAccept(compressed), 450);
  };

  const startCamera = useCallback(async () => {
    const gen = ++startGenRef.current;
    stopStream();
    setLiveError("");

    if (!canUseBrowserCamera()) {
      setLiveError(describeGetUserMediaError(undefined));
      setPhase("native");
      setTorchAvailable(false);
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
      fitMedia();
      if (!previewOk) {
        setLiveError(
          "Couldn't show the camera preview. Try Live preview again, or use Take photo."
        );
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

      const advertised =
        facing === "environment" && (await probeTorchSupport(track));
      if (gen !== startGenRef.current) return;

      if (facing !== "environment") {
        setTorchAvailable(false);
        setTorchOn(false);
      } else if (advertised) {
        setTorchAvailable(true);
      } else if (isLikelyAndroid()) {
        setTorchAvailable(true);
      } else {
        setTorchAvailable(false);
      }

      if (torchDesiredRef.current && facing === "environment") {
        const result = await applyDesiredTorch(track, true);
        if (gen !== startGenRef.current) return;
        setTorchOn(result.on);
        setTorchAvailable(result.supported || result.on);
        await bindStreamToVideo(videoRef.current, stream, false);
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
      setTorchAvailable(false);
      setTorchOn(false);
    }
  }, [stopStream, fitMedia]);

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
    fitMedia();
  }, [phase, fitMedia]);

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
      setTorchAvailable(false);
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
    if (facingMode === "user") {
      setTorchAvailable(false);
      torchDesiredRef.current = false;
      setTorchOn(false);
      return;
    }

    const next = !torchDesiredRef.current;
    torchDesiredRef.current = next;
    const result = await applyTorchAndKeepPreview(track, video, stream, next);

    if (result.applied && result.previewLive) {
      setTorchOn(next);
      setTorchAvailable(true);
      setLiveError("");
      return;
    }

    torchDesiredRef.current = false;
    setTorchOn(false);
    if (!result.applied) {
      setTorchAvailable(false);
    }
    if (!result.previewLive) {
      await bindStreamToVideo(video, stream, true);
      if (!isPreviewLive(videoRef.current)) {
        setPhase("native");
        startGenRef.current += 1;
        stopStream();
        setLiveError(
          "Live preview stopped after flashlight. Use Take photo instead."
        );
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
    fitMedia();
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (video.paused) void video.play().catch(() => {});
  }, [open, phase, orientationVersion, fitMedia]);

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

  const handleClose = () => {
    void restoreNaturalOrientation();
    onClose();
  };

  const openNativeCamera = () => fileInputRef.current?.click();

  if (!open || typeof document === "undefined") return null;

  const flashlightUsable =
    facingMode === "environment" && torchAvailable !== false;

  const overlay = (
    <div
      className="camera-overlay"
      data-camera-facing={facingMode}
      data-capture-phase={phase}
      data-overlay="none"
      data-torch-on={torchOn ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-label="Live preview"
    >
      <div className="camera-overlay-chrome">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-300">
            Live preview · Photo {photoNumber} / {totalPhotos}
          </p>
          <h3 className="text-white text-base font-bold leading-tight truncate">
            {photoStep.label}
          </h3>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <CheckoutFeedbackButton variant="overlay" />
          <button
            type="button"
            onClick={handleClose}
            className="flex-shrink-0 p-2 rounded-full bg-white/15 text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close live preview"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="camera-overlay-stage">
        {phase !== "preview" && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            controls={false}
            disablePictureInPicture
            controlsList="nofullscreen nodownload noremoteplayback"
            className={`camera-overlay-video ${
              facingMode === "user" ? "camera-media-mirror" : ""
            }`}
            style={{ opacity: phase === "live" ? 1 : 0 }}
            {...{ "webkit-playsinline": "true" }}
          />
        )}
        {phase === "preview" && previewUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            ref={previewRef}
            src={previewUrl}
            alt="Preview"
            className="camera-overlay-video object-contain"
          />
        )}
        {phase === "native" && (
          <div className="absolute inset-0 bg-black flex items-center justify-center px-4">
            <p className="text-center text-sm text-white/80">
              {liveError || "Starting camera…"}
            </p>
          </div>
        )}
        {checkingQuality && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white text-sm font-medium">Saving photo…</p>
          </div>
        )}
      </div>

      <div className="camera-overlay-controls">
        {liveError && phase === "live" && (
          <div className="flex items-start gap-2 bg-red-950/90 rounded-xl px-3 py-2 border border-red-500/40">
            <AlertTriangle className="h-4 w-4 text-red-300 flex-shrink-0 mt-0.5" />
            <p className="text-red-50 text-xs leading-snug">{liveError}</p>
          </div>
        )}
        {phase === "live" && liveLowLight && (
          <p className="text-center text-xs text-amber-200">
            {flashlightUsable
              ? torchOn
                ? "Low light — flashlight is on"
                : "Low light — turn on Flashlight"
              : isLikelyIOS()
                ? "Low light — use Take photo and Camera flash"
                : "Low light — use Take photo for a single flash"}
          </p>
        )}
        {phase === "preview" && !qualityPassed && !checkingQuality && (
          <div className="bg-red-600/95 text-white rounded-xl px-3 py-2 text-sm">
            <p className="font-bold">Photo did not pass quality check</p>
            {qualityMessages.map((msg) => (
              <p key={msg} className="text-xs text-red-100 mt-1">
                {msg}
              </p>
            ))}
          </div>
        )}
        {phase === "preview" && qualityWarnings.length > 0 && !checkingQuality && (
          <p className="text-xs text-amber-200 text-center">
            {qualityWarnings.join(" · ")}
          </p>
        )}

        {phase === "live" && (
          <>
            <div className="camera-live-actions">
              <button
                type="button"
                onClick={flipCamera}
                className="camera-overlay-btn"
              >
                <SwitchCamera className="h-5 w-5" />
                Flip
              </button>
              <FlashlightControl
                on={torchOn}
                available={flashlightUsable}
                onToggle={() => void toggleTorch()}
              />
              <button
                type="button"
                onClick={capturePhoto}
                disabled={capturing}
                className="camera-shutter-btn"
              >
                Capture
              </button>
            </div>
            <button
              type="button"
              onClick={openNativeCamera}
              className="camera-native-fallback"
            >
              Take photo instead
            </button>
          </>
        )}

        {phase === "native" && (
          <>
            <Button
              size="lg"
              className="w-full h-12 text-base bg-brand-600"
              onClick={openNativeCamera}
              disabled={capturing}
            >
              <Camera className="h-5 w-5 mr-2" />
              Take photo
            </Button>
            <button
              type="button"
              onClick={handleClose}
              className="block w-full text-center text-white/70 text-xs underline py-1"
            >
              Close live preview
            </button>
          </>
        )}

        {phase === "preview" && autoAccepting && (
          <div className="flex items-center justify-center gap-2 h-12 rounded-xl bg-green-600 text-white font-bold">
            <Check className="h-5 w-5" />
            Photo accepted
          </div>
        )}
        {phase === "preview" && !autoAccepting && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={retake}
              className="h-12 rounded-xl border-2 border-red-400 bg-red-950/70 text-red-100 font-bold"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={() => previewUrl && qualityPassed && onAccept(previewUrl)}
              disabled={!qualityPassed || checkingQuality}
              className="h-12 rounded-xl bg-green-600 text-white font-bold disabled:opacity-40"
            >
              Use photo
            </button>
          </div>
        )}
      </div>

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
    </div>
  );

  return createPortal(overlay, document.body);
}
