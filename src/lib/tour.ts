import type { UserRole } from "./types";

export type TourAudience = "driver" | "office";

export interface TourStep {
  title: string;
  body: string;
}

export const TOUR_STORAGE_KEY = "inspekt-tour-seen";
export const TOUR_REPLAY_EVENT = "inspekt-tour-replay";

const DRIVER_STEPS: TourStep[] = [
  {
    title: "Start a checkout",
    body: "This is the check Office reviews. Pick the unit, finish the precheck, and sign.",
  },
  {
    title: "It stays on this phone",
    body: "If the signal drops, the check and its photos stay here and send when you are back online. Submitting again does not create a second report.",
  },
  {
    title: "Line up the photo",
    body: "Each required angle shows an outline on the camera. Match the outline, then capture.",
  },
  {
    title: "Watch it send",
    body: "My recent checks moves from Saved on phone, to Uploading, to Sent.",
  },
];

const OFFICE_STEPS: TourStep[] = [
  {
    title: "Office is the record",
    body: "A checkout is saved on the phone, then uploaded, then marked sent. Slack is only a copy.",
  },
  {
    title: "Spot a stuck check",
    body: "The office list shows Saved, Uploading, or Sent. A check that sits for more than 30 minutes is flagged stuck.",
  },
  {
    title: "The PIN stays on",
    body: "Unlock the office list with the PIN. The demo role buttons stay on the home screen.",
  },
];

export function tourAudience(user: { role: UserRole | string; roleTitle?: string }): TourAudience {
  if (user.roleTitle === "Owner" || user.roleTitle === "Office") return "office";
  if (user.role === "management" || user.role === "super_admin" || user.role === "tech") {
    return "office";
  }
  return "driver";
}

export function tourSteps(audience: TourAudience): TourStep[] {
  return audience === "office" ? OFFICE_STEPS : DRIVER_STEPS;
}

export function readTourSeen(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === "driver" || value === "office") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function tourIsSeen(
  seen: Record<string, string>,
  userId: string,
  audience: TourAudience
): boolean {
  return seen[userId] === audience;
}

export function markTourSeen(
  seen: Record<string, string>,
  userId: string,
  audience: TourAudience
): Record<string, string> {
  return { ...seen, [userId]: audience };
}

export function requestTourReplay(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TOUR_REPLAY_EVENT));
}
