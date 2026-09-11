/** Whether in-browser live camera (getUserMedia) is available. Requires HTTPS. */
export function canUseBrowserCamera(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

export type CameraFacing = "environment" | "user";

const SESSION_FACING_KEY = "fleetcheck-camera-facing";

type TorchCapability = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };
type TorchSettings = MediaTrackSettings & { torch?: boolean };

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

export function isLikelyIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

/**
 * Keep facingMode as *ideal* only (never exact) and skip aspectRatio.
 * Exact facing + portrait/landscape size locks have been seen to fight the
 * torch constraint and restart the track (black live preview).
 */
export function videoConstraintsForFacing(
  facing: CameraFacing
): MediaTrackConstraints {
  return {
    facingMode: { ideal: facing },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
}

/** Prefer the requested lens; fall back to a bare facingMode if the device rejects size. */
export async function openCameraStream(
  facing: CameraFacing
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: videoConstraintsForFacing(facing),
      audio: false,
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing } },
      audio: false,
    });
  }
}

export function getStreamVideoTrack(
  stream: MediaStream | null
): MediaStreamTrack | null {
  return stream?.getVideoTracks()[0] ?? null;
}

/** True only when the live track advertises a torch. iOS Safari typically does not. */
export function trackSupportsTorch(track: MediaStreamTrack | null): boolean {
  if (!track || track.readyState !== "live") return false;
  if (typeof track.getCapabilities !== "function") return false;
  try {
    const caps = track.getCapabilities() as TorchCapability;
    return caps?.torch === true;
  } catch {
    return false;
  }
}

export function trackTorchIsOn(track: MediaStreamTrack | null): boolean {
  if (!track || typeof track.getSettings !== "function") return false;
  try {
    return (track.getSettings() as TorchSettings).torch === true;
  } catch {
    return false;
  }
}

export function isPreviewLive(video: HTMLVideoElement | null): boolean {
  return Boolean(
    video &&
      video.srcObject &&
      !video.paused &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
  );
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

export async function waitForElement<T>(
  get: () => T | null | undefined,
  timeoutMs = 2000
): Promise<T | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = get();
    if (value) return value;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return get() ?? null;
}

/**
 * Capabilities are often empty until the track is producing frames.
 * Probe after the preview is live rather than immediately after getUserMedia.
 */
export async function probeTorchSupport(
  track: MediaStreamTrack | null,
  attempts = 10
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (trackSupportsTorch(track)) return true;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return trackSupportsTorch(track);
}

/**
 * Attach (or re-attach) a stream to the video element and wait for a frame.
 * Re-assigning srcObject is required after torch applyConstraints on many
 * Android Chrome builds — the track stays live but the <video> goes black.
 */
export async function bindStreamToVideo(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
  remount = false
): Promise<boolean> {
  if (!video || !stream) return false;

  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;

  const alreadyBound = video.srcObject === stream;
  if (remount || !alreadyBound) {
    if (video.srcObject) video.srcObject = null;
    video.srcObject = stream;
  }

  try {
    await video.play();
  } catch {
    /* muted + playsInline should allow autoplay; ignore AbortError on remount */
  }

  return waitForVideoFrame(video);
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

export function describeTorchUnavailable(): string {
  if (isLikelyIOS()) {
    return "iPhone can’t run a flashlight in Live preview. Use Take photo and the Camera flash, or turn on the LED torch from Control Center.";
  }
  return "This camera doesn’t expose a flashlight. Use Take photo for a single flash.";
}

/**
 * Continuous torch only. Do not mix facingMode/size into this call, and do not
 * use ImageCapture fillLightMode "flash" (that is a one-shot photo flash and
 * can black out the live preview).
 */
export async function setTrackTorch(
  track: MediaStreamTrack | null,
  on: boolean
): Promise<boolean> {
  if (!track || track.readyState !== "live") return false;
  if (on && !trackSupportsTorch(track)) return false;

  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as TorchConstraint],
    });
  } catch {
    return false;
  }

  try {
    const settings = track.getSettings() as TorchSettings;
    if (typeof settings.torch === "boolean") return settings.torch === on;
  } catch {
    /* some engines omit torch from getSettings even when the LED is on */
  }
  return true;
}

/** Apply session torch after a genuine stream restart (flip / track ended). */
export async function applyDesiredTorch(
  track: MediaStreamTrack | null,
  desired: boolean
): Promise<{ supported: boolean; on: boolean }> {
  const supported = await probeTorchSupport(track);
  if (!desired) {
    if (supported && trackTorchIsOn(track)) {
      await setTrackTorch(track, false);
    }
    return { supported, on: false };
  }
  if (!supported) return { supported: false, on: false };
  const ok = await setTrackTorch(track, true);
  return { supported: true, on: ok };
}

/**
 * After torch on/off, recover a black <video> without stopping the track.
 * If the preview cannot be recovered with torch on, turn torch off and recover.
 */
export async function applyTorchAndKeepPreview(
  track: MediaStreamTrack | null,
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
  on: boolean
): Promise<{
  applied: boolean;
  previewLive: boolean;
  supported: boolean;
  rolledBack: boolean;
}> {
  const supported = trackSupportsTorch(track);
  if (!track || !supported) {
    const previewLive = await bindStreamToVideo(video, stream);
    return { applied: false, previewLive, supported: false, rolledBack: false };
  }

  const applied = await setTrackTorch(track, on);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  let previewLive = await bindStreamToVideo(video, stream, true);

  if (on && applied && !previewLive) {
    await setTrackTorch(track, false);
    previewLive = await bindStreamToVideo(video, stream, true);
    return { applied: false, previewLive, supported: true, rolledBack: true };
  }

  if (!previewLive) {
    previewLive = await bindStreamToVideo(video, stream, true);
  }

  return { applied, previewLive, supported: true, rolledBack: false };
}
