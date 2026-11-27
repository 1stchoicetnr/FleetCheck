import { beforeCaption, type BeforeAfterPair } from "./damage-before-after.ts";
import { formatCheckoutTime } from "./checkout-slack.ts";

/** Normalized highlight on a photo, 0..1, same coordinates the thumbnail uses. */
export interface ViewerBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One photo in the full-screen viewer.
 * `src` is the address already given to the page (the app's signed-in photo
 * route, or a local data URL). It is never rewritten to a public blob URL.
 */
export interface ViewerSlide {
  id: string;
  src: string;
  label: string;
  /** Short context above the label, such as the photo angle. */
  kicker?: string;
  box?: ViewerBox;
}

export function changeBoxStyle(box: ViewerBox): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  };
}

/** Drop shots with no photo. Each src is copied through unchanged. */
export function viewerSlides(
  shots: readonly {
    id: string;
    src?: string | null;
    label: string;
    kicker?: string;
    box?: ViewerBox;
  }[]
): ViewerSlide[] {
  const slides: ViewerSlide[] = [];
  for (const shot of shots) {
    if (!shot.src) continue;
    const slide: ViewerSlide = { id: shot.id, src: shot.src, label: shot.label };
    if (shot.kicker) slide.kicker = shot.kicker;
    if (shot.box) slide.box = shot.box;
    slides.push(slide);
  }
  return slides;
}

export interface PhotoCheckView {
  angle: string;
  label: string;
  box?: ViewerBox;
  before?: { src: string; completedAt: string; driverName: string };
  after: { src: string; completedAt: string; driverName: string };
}

/**
 * The before photo and the new photo for one "Found by photo check" finding.
 * The list is only that finding, so swipe and arrows stay on this pair.
 */
export function photoCheckViewerSlides(finding: PhotoCheckView): ViewerSlide[] {
  return viewerSlides([
    {
      id: `${finding.angle}:before`,
      src: finding.before?.src,
      kicker: finding.label,
      label: finding.before
        ? `Before (${formatCheckoutTime(finding.before.completedAt)}, ${finding.before.driverName})`
        : "",
    },
    {
      id: `${finding.angle}:new`,
      src: finding.after.src,
      kicker: finding.label,
      label: "New",
      box: finding.box,
    },
  ]);
}

/** Before and after for one damaged slot. Other slots are not included. */
export function beforeAfterViewerSlides(pair: BeforeAfterPair): ViewerSlide[] {
  return viewerSlides([
    {
      id: `${pair.angle}:before`,
      src: pair.before?.src,
      kicker: pair.label,
      label: beforeCaption(pair, formatCheckoutTime),
    },
    {
      id: `${pair.angle}:after`,
      src: pair.after?.src,
      kicker: pair.label,
      label: pair.afterIsCloseUp ? "After · close-up, this check" : "After · this check",
    },
  ]);
}
