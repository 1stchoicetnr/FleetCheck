/** Whether in-browser live camera (getUserMedia) is available. Requires HTTPS. */
export function canUseBrowserCamera(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

export type CameraFacing = "environment" | "user";

const SESSION_FACING_KEY = "fleetcheck-camera-facing";

/** Rear / environment-facing is the default for every checklist step. */
export function getSessionCameraFacing(): CameraFacing {
  if (typeof window === "undefined") return "environment";
  try {
    return sessionStorage.getItem(SESSION_FACING_KEY) === "user"
      ? "user"
      : "environment";
  } catch {
    return "environment";
  }
}

export function setSessionCameraFacing(facing: CameraFacing): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_FACING_KEY, facing);
  } catch {
    /* private mode / blocked storage */
  }
}

export function videoConstraintsForFacing(
  facing: CameraFacing,
  landscape: boolean,
  exact: boolean
): MediaTrackConstraints {
  return {
    facingMode: exact ? { exact: facing } : { ideal: facing },
    width: { ideal: landscape ? 1920 : 1080 },
    height: { ideal: landscape ? 1080 : 1920 },
    aspectRatio: { ideal: landscape ? 16 / 9 : 9 / 16 },
  };
}

/** Prefer the requested lens; fall back to ideal if the device rejects exact. */
export async function openCameraStream(
  facing: CameraFacing,
  landscape: boolean
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraintsForFacing(facing, landscape, true),
      audio: false,
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraintsForFacing(facing, landscape, false),
      audio: false,
    });
  }
}

type TorchCapability = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

type ImageCaptureLike = {
  setOptions?: (opts: { fillLightMode: "off" | "flash" | "auto" }) => Promise<void>;
};

export function getStreamVideoTrack(
  stream: MediaStream | null
): MediaStreamTrack | null {
  return stream?.getVideoTracks()[0] ?? null;
}

/** True only when the live track advertises a torch. iOS Safari typically does not. */
export function trackSupportsTorch(track: MediaStreamTrack | null): boolean {
  if (!track || typeof track.getCapabilities !== "function") return false;
  try {
    const caps = track.getCapabilities() as TorchCapability;
    return Boolean(caps && "torch" in caps && caps.torch !== false);
  } catch {
    return false;
  }
}

export async function waitForVideoFrame(
  video: HTMLVideoElement,
  timeoutMs = 2500
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      return true;
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return video.videoWidth > 0 && video.videoHeight > 0;
}

export function describeGetUserMediaError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Camera permission denied. Use Take photo to open your phone camera.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No camera found. Use Take photo instead.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Camera is in use by another app. Close it, or use Take photo.";
  }
  if (typeof window !== "undefined" && !canUseBrowserCamera()) {
    return "Live preview needs HTTPS. Use Take photo instead.";
  }
  return "Live preview couldn't start. Use Take photo instead.";
}

/** Re-apply session torch after a stream restart (orientation, flip, track ended). */
export async function applyDesiredTorch(
  track: MediaStreamTrack | null,
  desired: boolean
): Promise<{ supported: boolean; on: boolean }> {
  const supported = trackSupportsTorch(track);
  if (!desired) {
    if (supported) await setTrackTorch(track, false);
    return { supported, on: false };
  }
  if (!supported) return { supported: false, on: false };
  const ok = await setTrackTorch(track, true);
  return { supported: true, on: ok };
}

export async function setTrackTorch(
  track: MediaStreamTrack | null,
  on: boolean
): Promise<boolean> {
  if (!track) return false;

  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as TorchConstraint],
    });
    return true;
  } catch {
    /* try a flat constraint next */
  }

  try {
    await track.applyConstraints({ torch: on } as MediaTrackConstraints);
    return true;
  } catch {
    /* ImageCapture fillLightMode — last resort, not a fake UI toggle */
  }

  try {
    const Ctor = (
      window as unknown as {
        ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike;
      }
    ).ImageCapture;
    if (!Ctor) return false;
    const capture = new Ctor(track);
    if (!capture.setOptions) return false;
    await capture.setOptions({ fillLightMode: on ? "flash" : "off" });
    return true;
  } catch {
    return false;
  }
}
