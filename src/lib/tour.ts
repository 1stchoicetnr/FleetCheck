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
    title: "Start a check",
    body: "Pick the unit, answer the questions, and sign. The office reads this check.",
  },
  {
    title: "Flags at the bottom",
    body: "At the bottom of the questions are four flags: Safety issue, Needs repair, Refuse to drive, and Out of service. Tap one only when it is true.",
  },
  {
    title: "Take the photos",
    body: "The camera shows an outline. Line the vehicle up with it, then take the photo. A dark, blurry, or blank photo has to be taken again.",
  },
  {
    title: "If the phone loses signal",
    body: "The check stays on this phone. My recent checks shows Saved on phone, then Uploading, then Sent. Sending it again does not make a second check.",
  },
];

const OFFICE_STEPS: TourStep[] = [
  {
    title: "The check is the record",
    body: "The phone saves the check, then uploads it, then marks it sent. Slack is only a copy.",
  },
  {
    title: "A check that did not finish",
    body: "The office list shows Saved, Uploading, or Sent. A check that sits for more than 30 minutes is marked stuck.",
  },
  {
    title: "How people sign in",
    body: "People sign in with the email and password an owner approved. The office PIN stays on the sign-in page until an owner sets a password.",
  },
];

export function tourAudience(user: { role: UserRole | string; roleTitle?: string }): TourAudience {
  if (
    user.roleTitle === "Owner" ||
    user.roleTitle === "Manager" ||
    user.roleTitle === "Office"
  ) {
    return "office";
  }
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
