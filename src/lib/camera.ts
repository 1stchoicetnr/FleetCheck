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

type ImageCaptureLike = {
  getPhotoCapabilities: () => Promise<{
    fillLightMode?: string[];
    torch?: boolean;
  }>;
};

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

export function isLikelyAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

function makeImageCapture(
  track: MediaStreamTrack | null
): ImageCaptureLike | null {
  if (!track || typeof window === "undefined") return null;
  const Ctor = (
    window as unknown as {
      ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike;
    }
  ).ImageCapture;
  if (!Ctor) return null;
  try {
    return new Ctor(track);
  } catch {
    return null;
  }
}

/**
 * Keep facingMode as *ideal* only. Skip width/height on the rear camera —
 * size locks pick profiles that hide torch on many Android Chrome builds.
 */
export function videoConstraintsForFacing(
  facing: CameraFacing
): MediaTrackConstraints {
  if (facing === "environment") {
    return { facingMode: { ideal: "environment" } };
  }
  return { facingMode: { ideal: "user" } };
}

function stopTracks(stream: MediaStream) {
  stream.getTracks().forEach((t) => t.stop());
}

function looksLikeRearCamera(label: string): boolean {
  const text = label.toLowerCase();
  if (/front|user|face|selfie/.test(text)) return false;
  if (/back|rear|environment|world/.test(text)) return true;
  return label.length === 0;
}

/** Prefer the requested lens; fall back to a bare facingMode if the device rejects extras. */
export async function openCameraStream(
  facing: CameraFacing
): Promise<MediaStream> {
  if (facing === "user") {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: videoConstraintsForFacing("user"),
        audio: false,
      });
    } catch {
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }
  }

  let stream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraintsForFacing("environment"),
    audio: false,
  });

  const first = stream.getVideoTracks()[0] ?? null;
  if (await probeTorchSupport(first)) return stream;

  let devices: MediaDeviceInfo[] = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    return stream;
  }

  const currentId = first?.getSettings?.().deviceId;
  const candidates = devices.filter((device) => {
    if (device.kind !== "videoinput") return false;
    if (currentId && device.deviceId === currentId) return false;
    return looksLikeRearCamera(device.label);
  });

  for (const device of candidates) {
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId } },
        audio: false,
      });
      if (await probeTorchSupport(next.getVideoTracks()[0] ?? null)) {
        stopTracks(stream);
        return next;
      }
      stopTracks(next);
    } catch {
      /* try the next rear camera */
    }
  }

  return stream;
}

export function getStreamVideoTrack(
  stream: MediaStream | null
): MediaStreamTrack | null {
  return stream?.getVideoTracks()[0] ?? null;
}

function capabilitiesSayTorch(track: MediaStreamTrack | null): boolean {
  if (!track || track.readyState !== "live") return false;
  if (typeof track.getCapabilities !== "function") return false;
  try {
    const caps = track.getCapabilities() as TorchCapability;
    return caps?.torch === true;
  } catch {
    return false;
  }
}

/** True when the live track (or ImageCapture) advertises a continuous torch. */
export function trackSupportsTorch(track: MediaStreamTrack | null): boolean {
  return capabilitiesSayTorch(track);
}

async function imageCaptureSeesTorch(
  track: MediaStreamTrack | null
): Promise<boolean> {
  if (capabilitiesSayTorch(track)) return true;
  const capture = makeImageCapture(track);
  if (!capture) return false;
  try {
    const caps = await capture.getPhotoCapabilities();
    if (caps?.torch === true) return true;
    // Constructing ImageCapture often fills track.getCapabilities().torch on Chromium.
    return capabilitiesSayTorch(track);
  } catch {
    return capabilitiesSayTorch(track);
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
  attempts = 24
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await imageCaptureSeesTorch(track)) return true;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return imageCaptureSeesTorch(track);
}

/**
 * Attach (or re-attach) a stream to the video element and wait for a frame.
 * Prefer play() / re-assigning srcObject without nulling — nulling the
 * srcObject after torch applyConstraints often leaves a black preview and
 * can drop the LED on Android Chrome.
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
  try {
    video.disableRemotePlayback = true;
  } catch {
    /* older engines */
  }

  const alreadyBound = video.srcObject === stream;
  if (!alreadyBound) {
    video.srcObject = stream;
  } else if (remount) {
    /* Re-assign without going through null — keeps torch on many Androids. */
    video.srcObject = stream;
  }

  try {
    await video.play();
  } catch {
    /* muted + playsInline should allow autoplay; ignore AbortError on remount */
  }

  return waitForVideoFrame(video);
}

/** True when the <video> is painting non-black pixels (vs a stalled decoder). */
export function videoHasVisibleFrames(video: HTMLVideoElement | null): boolean {
  if (!isPreviewLive(video) || !video) return false;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return true;
    ctx.drawImage(video, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (y > max) max = y;
    }
    /* A stalled/black decoder is ~0. A dark room still has some noise > 2. */
    return max >= 2.5;
  } catch {
    return true;
  }
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
 * Continuous torch. Try ImageCapture-backed capabilities first, then
 * applyConstraints in both the advanced and simple shapes Android Chrome uses.
 */
export async function setTrackTorch(
  track: MediaStreamTrack | null,
  on: boolean,
  opts?: { force?: boolean }
): Promise<boolean> {
  if (!track || track.readyState !== "live") return false;
  const advertised = await imageCaptureSeesTorch(track);
  if (on && !advertised && !opts?.force) return false;

  const attempts: MediaTrackConstraints[] = [
    { advanced: [{ torch: on } as TorchConstraint] },
    { torch: on } as MediaTrackConstraints,
  ];

  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints);
      try {
        const settings = track.getSettings() as TorchSettings;
        if (typeof settings.torch === "boolean") {
          if (settings.torch === on) return true;
          continue;
        }
      } catch {
        /* some engines omit torch from getSettings even when the LED is on */
      }
      return true;
    } catch {
      /* try the next constraint shape */
    }
  }
  return false;
}

/** Apply session torch after a genuine stream restart (flip / track ended). */
export async function applyDesiredTorch(
  track: MediaStreamTrack | null,
  desired: boolean
): Promise<{ supported: boolean; on: boolean }> {
  const supported = await probeTorchSupport(track);
  const force = !supported && isLikelyAndroid();
  if (!desired) {
    if ((supported || force) && trackTorchIsOn(track)) {
      await setTrackTorch(track, false, { force: true });
    }
    return { supported: supported || force, on: false };
  }
  const ok = await setTrackTorch(track, true, { force });
  return { supported: supported || ok, on: ok };
}

/**
 * After torch on/off, recover a black <video> without stopping the track.
 * Never null srcObject while torch is on — that blacks the preview on Android.
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
  if (!track) {
    const previewLive = await bindStreamToVideo(video, stream);
    return { applied: false, previewLive, supported: false, rolledBack: false };
  }

  const advertised = await imageCaptureSeesTorch(track);
  const force = advertised || isLikelyAndroid();
  if (on && !force) {
    const previewLive = await bindStreamToVideo(video, stream);
    return { applied: false, previewLive, supported: false, rolledBack: false };
  }

  const applied = await setTrackTorch(track, on, { force: true });

  /* Give exposure a beat to catch up after the LED toggles. */
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  let previewLive = await bindStreamToVideo(video, stream, false);

  if (previewLive) {
    return {
      applied,
      previewLive: true,
      supported: advertised || applied,
      rolledBack: false,
    };
  }

  previewLive = await bindStreamToVideo(video, stream, true);

  if (previewLive) {
    return {
      applied,
      previewLive: true,
      supported: advertised || applied,
      rolledBack: false,
    };
  }

  if (on && applied) {
    await setTrackTorch(track, false, { force: true });
    previewLive = await bindStreamToVideo(video, stream, true);
    return { applied: false, previewLive, supported: true, rolledBack: true };
  }

  return {
    applied,
    previewLive,
    supported: advertised || applied,
    rolledBack: false,
  };
}
