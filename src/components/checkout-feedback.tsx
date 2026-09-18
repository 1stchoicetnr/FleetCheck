"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FEEDBACK_NOTE_MAX,
  FEEDBACK_TO_DEFAULT,
  FEEDBACK_TYPES,
  FeedbackPhotoStep,
  FeedbackType,
} from "@/lib/feedback";
import { compressImage, fileToDataUrl } from "@/lib/utils";

const FEEDBACK_SCREENSHOT_EDGE = 1280;
const FEEDBACK_SCREENSHOT_QUALITY = 0.7;

interface FeedbackMeta {
  unitId?: string;
  unitNumber?: string;
  plate?: string;
  pagePhase?: string;
  driverName?: string;
}

interface CheckoutFeedbackContextValue {
  openFeedback: () => void;
  setMeta: (meta: FeedbackMeta) => void;
  setPhotoStep: (step: FeedbackPhotoStep | null) => void;
}

const CheckoutFeedbackContext =
  createContext<CheckoutFeedbackContextValue | null>(null);

export function useCheckoutFeedback(): CheckoutFeedbackContextValue | null {
  return useContext(CheckoutFeedbackContext);
}

export function useCheckoutFeedbackMeta(meta: FeedbackMeta) {
  const ctx = useCheckoutFeedback();
  const { unitId, unitNumber, plate, pagePhase, driverName } = meta;
  useEffect(() => {
    ctx?.setMeta({ unitId, unitNumber, plate, pagePhase, driverName });
    return () => ctx?.setMeta({});
  }, [ctx, unitId, unitNumber, plate, pagePhase, driverName]);
}

export function CheckoutFeedbackProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [meta, setMetaState] = useState<FeedbackMeta>({});
  const [photoStep, setPhotoStepState] = useState<FeedbackPhotoStep | null>(
    null
  );

  const setMeta = useCallback((next: FeedbackMeta) => {
    setMetaState((prev) => {
      if (
        prev.unitId === next.unitId &&
        prev.unitNumber === next.unitNumber &&
        prev.plate === next.plate &&
        prev.pagePhase === next.pagePhase &&
        prev.driverName === next.driverName
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const setPhotoStep = useCallback((step: FeedbackPhotoStep | null) => {
    setPhotoStepState((prev) => {
      if (prev === step) return prev;
      if (!prev && !step) return prev;
      if (
        prev &&
        step &&
        prev.index === step.index &&
        prev.total === step.total &&
        prev.label === step.label
      ) {
        return prev;
      }
      return step;
    });
  }, []);

  const openFeedback = useCallback(() => setOpen(true), []);
  const closeFeedback = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openFeedback, setMeta, setPhotoStep }),
    [openFeedback, setMeta, setPhotoStep]
  );

  return (
    <CheckoutFeedbackContext.Provider value={value}>
      {children}
      <FeedbackDialog
        open={open}
        onClose={closeFeedback}
        meta={meta}
        photoStep={photoStep}
      />
    </CheckoutFeedbackContext.Provider>
  );
}

export function CheckoutFeedbackButton({
  variant = "header",
}: {
  variant?: "header" | "overlay";
}) {
  const ctx = useCheckoutFeedback();
  if (!ctx) return null;

  const overlay = variant === "overlay";
  return (
    <button
      type="button"
      onClick={ctx.openFeedback}
      className={
        overlay
          ? "flex-shrink-0 inline-flex items-center justify-center gap-1 min-h-[44px] px-3 rounded-full border border-white/40 bg-white/15 text-white text-xs font-semibold"
          : "flex-shrink-0 inline-flex items-center justify-center gap-1 min-h-[40px] px-2.5 rounded-full border border-brand-200 bg-brand-50 text-brand-800 text-xs font-semibold hover:bg-brand-100 active:bg-brand-200 touch-manipulation"
      }
      aria-label="Send app feedback"
    >
      <MessageSquarePlus className="h-4 w-4" />
      Feedback
    </button>
  );
}

function FeedbackDialog({
  open,
  onClose,
  meta,
  photoStep,
}: {
  open: boolean;
  onClose: () => void;
  meta: FeedbackMeta;
  photoStep: FeedbackPhotoStep | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<FeedbackType | "">("");
  const [note, setNote] = useState("");
  const [screenshot, setScreenshot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loggedOnly, setLoggedOnly] = useState(false);
  const [canCaptureScreen, setCanCaptureScreen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType("");
    setNote("");
    setScreenshot("");
    setBusy(false);
    setError("");
    setDone(false);
    setLoggedOnly(false);
    setCanCaptureScreen(
      typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getDisplayMedia === "function"
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const attachFile = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      setScreenshot(
        await compressImage(
          dataUrl,
          FEEDBACK_SCREENSHOT_EDGE,
          FEEDBACK_SCREENSHOT_QUALITY
        )
      );
    } catch {
      setError("Couldn't use that image. Try another screenshot.");
    } finally {
      setBusy(false);
    }
  };

  const captureScreen = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("This browser can't capture the screen. Attach a screenshot instead.");
      return;
    }
    setBusy(true);
    setError("");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("No screen track");
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      const raw = canvas.toDataURL("image/jpeg", FEEDBACK_SCREENSHOT_QUALITY);
      setScreenshot(
        await compressImage(raw, FEEDBACK_SCREENSHOT_EDGE, FEEDBACK_SCREENSHOT_QUALITY)
      );
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setError("Couldn't capture the screen. Attach a screenshot instead.");
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!type) {
      setError("Pick Bug, Glitch, or Idea.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          note: note.trim() || undefined,
          screenshotDataUrl: screenshot || undefined,
          unitId: meta.unitId,
          unitNumber: meta.unitNumber,
          plate: meta.plate,
          pagePhase: meta.pagePhase,
          photoStep: photoStep || undefined,
          pageUrl:
            typeof window !== "undefined" ? window.location.href : undefined,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          timestamp: new Date().toISOString(),
          driverName: meta.driverName,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        logged?: boolean;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not send feedback.");
      }
      setLoggedOnly(Boolean(data.logged));
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not send feedback."
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="feedback-dialog fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-3 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200">
          <div>
            <h2 id="feedback-title" className="text-base font-bold text-gray-900">
              App feedback
            </h2>
            <p className="text-xs text-gray-500">
              Bugs, glitches, or ideas — not vehicle damage. Goes to{" "}
              {FEEDBACK_TO_DEFAULT}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close feedback"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <p className="px-4 py-8 text-center text-sm font-semibold text-green-700">
            {loggedOnly
              ? "Saved on this machine — set RESEND_API_KEY on Vercel to email Ashley."
              : "Sent. Thanks — Ashley will see it."}
          </p>
        ) : (
          <div className="px-4 py-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {FEEDBACK_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={`min-h-[48px] rounded-xl border-2 text-sm font-semibold ${
                    type === value
                      ? "border-brand-600 bg-brand-50 text-brand-800"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="block text-sm font-semibold text-gray-900 mb-1">
                Note (optional)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, FEEDBACK_NOTE_MAX))}
                rows={3}
                placeholder="What happened, or the idea"
                className="w-full rounded-xl border-2 border-gray-300 px-3 py-2 text-base focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
              />
            </label>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900">
                Screenshot (optional)
              </p>
              {screenshot ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshot}
                    alt="Attached screenshot"
                    className="h-16 w-16 rounded-lg object-cover border border-gray-200"
                  />
                  <button
                    type="button"
                    className="text-sm font-semibold text-red-700 underline"
                    onClick={() => setScreenshot("")}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-800"
                  >
                    <ImageIcon className="h-4 w-4" />
                    Camera roll
                  </button>
                  {canCaptureScreen && (
                    <button
                      type="button"
                      onClick={() => void captureScreen()}
                      disabled={busy}
                      className="inline-flex items-center min-h-[44px] px-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-800"
                    >
                      Capture this screen
                    </button>
                  )}
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void attachFile(file);
                  e.target.value = "";
                }}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 font-medium">{error}</p>
            )}

            <Button
              size="lg"
              className="w-full"
              onClick={() => void submit()}
              disabled={busy || !type}
            >
              {busy ? "Sending…" : "Send to Ashley"}
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
