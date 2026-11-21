import { closeUpGapText, missingCloseUps } from "./damage-closeup.ts";
import type { PhotoAngle } from "./types.ts";

/**
 * Everything still stopping a driver from submitting, in the order they should
 * fix it. The checkout page shows each one as a tap-to-jump row and uses the
 * first one as the reason on the (disabled) Submit / Review button, so a driver
 * is never left at "all photos done" with no way forward.
 */
export type CheckoutBlocker =
  | { kind: "precheck"; text: string }
  | { kind: "photo"; angle: PhotoAngle; text: string }
  | { kind: "closeup"; angle: PhotoAngle; text: string }
  | { kind: "signature"; text: string };

export interface CheckoutBlockerInput {
  precheckOk: boolean;
  precheckError?: string;
  /** Red precheck: the unit is parked, photos are skipped. */
  redPark: boolean;
  steps: ReadonlyArray<{ angle: PhotoAngle; label: string; required: boolean }>;
  photos: Partial<Record<string, string>>;
  flags?: Partial<Record<string, { flaggedDamage?: boolean; knownDamageAnswer?: "same" | "new"; damageSpot?: { x: number; y: number } }>>;
  precheckSlots: readonly PhotoAngle[];
  /** Testing builds can skip photos. */
  skipPhotos: boolean;
  /** Driver tapped "Done with photos" on the last step. */
  photosReady: boolean;
  signed: boolean;
}

export function checkoutBlockers(input: CheckoutBlockerInput): CheckoutBlocker[] {
  const out: CheckoutBlocker[] = [];
  if (!input.precheckOk) {
    out.push({ kind: "precheck", text: input.precheckError?.trim() || "Finish the Precheck." });
  }
  if (!input.redPark && !input.skipPhotos) {
    const required = input.steps.filter((s) => s.required);
    const missing = required.filter((s) => !input.photos[s.angle]);
    if (missing.length && !input.photosReady) {
      const next = missing[0];
      out.push({
        kind: "photo",
        angle: next.angle,
        text: `${missing.length} photo${missing.length === 1 ? "" : "s"} left (${required.length - missing.length}/${required.length}). Next: ${next.label}`,
      });
    }
    const labelOf = (angle: PhotoAngle) => required.find((s) => s.angle === angle)?.label ?? angle;
    for (const gap of missingCloseUps(
      required.map((s) => s.angle),
      input.flags,
      input.photos,
      input.precheckSlots
    )) {
      out.push({ kind: "closeup", angle: gap.angle, text: closeUpGapText(labelOf(gap.angle), gap) });
    }
  }
  if (!input.signed) out.push({ kind: "signature", text: "Sign your name" });
  return out;
}

/** Short reason for the disabled button. */
export function blockerButtonLabel(blockers: readonly CheckoutBlocker[]): string {
  const first = blockers[0];
  if (!first) return "";
  if (first.kind === "precheck") return "Finish Precheck first";
  if (first.kind === "photo") return "Finish the photos first";
  if (first.kind === "closeup") {
    const n = blockers.filter((b) => b.kind === "closeup").length;
    return n === 1 ? "1 damage close-up left" : `${n} damage close-ups left`;
  }
  return "Sign above to continue";
}
