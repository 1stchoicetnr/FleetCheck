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
