"use client";

import { ChevronRight } from "lucide-react";
import type { CheckoutBlocker } from "@/lib/checkout-blockers";

/** "Still needed before you can submit" — each row jumps to the fix. */
export function CheckoutMissingList({
  blockers,
  onJump,
}: {
  blockers: readonly CheckoutBlocker[];
  onJump: (blocker: CheckoutBlocker) => void;
}) {
  if (!blockers.length) return null;
  return (
    <div
      className="checkout-missing-list rounded-xl border-2 border-amber-500 bg-amber-50 p-3 space-y-2"
      data-testid="checkout-missing"
      role="status"
    >
      <p className="text-sm font-bold text-amber-950">Still needed before you can submit:</p>
      <ul className="space-y-1.5">
        {blockers.map((b, i) => (
          <li key={`${b.kind}-${"angle" in b ? b.angle : i}`}>
            <button
              type="button"
              onClick={() => onJump(b)}
              className="w-full min-h-[44px] flex items-center justify-between gap-2 rounded-lg border border-amber-400 bg-white px-3 py-2 text-left text-sm font-semibold text-amber-950"
            >
              <span>{b.text}</span>
              <span className="flex items-center shrink-0 text-brand-700 underline">
                Go <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
