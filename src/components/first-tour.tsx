"use client";

import { useAuth } from "@/hooks/use-auth";
import {
  markTourSeen,
  readTourSeen,
  TOUR_REPLAY_EVENT,
  TOUR_STORAGE_KEY,
  tourAudience,
  tourIsSeen,
  tourSteps,
} from "@/lib/tour";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";

function hiddenPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/sign-in" || pathname.startsWith("/setup");
}

export function FirstTour() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const audience = user ? tourAudience(user) : "driver";
  const steps = tourSteps(audience);

  const finish = useCallback(() => {
    if (!user) return;
    const seen = readTourSeen(localStorage.getItem(TOUR_STORAGE_KEY));
    localStorage.setItem(
      TOUR_STORAGE_KEY,
      JSON.stringify(markTourSeen(seen, user.id, audience))
    );
    setOpen(false);
    setStep(0);
  }, [audience, user]);

  useEffect(() => {
    if (!user || hiddenPath(pathname)) {
      setOpen(false);
      return;
    }
    const seen = readTourSeen(localStorage.getItem(TOUR_STORAGE_KEY));
    if (!tourIsSeen(seen, user.id, audience)) {
      setStep(0);
      setOpen(true);
    }
  }, [audience, pathname, user]);

  useEffect(() => {
    function replay() {
      if (!user || hiddenPath(pathname)) return;
      setStep(0);
      setOpen(true);
    }
    window.addEventListener(TOUR_REPLAY_EVENT, replay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, replay);
  }, [pathname, user]);

  if (!open || !user) return null;
  const current = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {step + 1} of {steps.length}
        </p>
        <h2 id="tour-title" className="text-xl font-bold text-gray-900">
          {current.title}
        </h2>
        <p className="text-sm text-gray-600">{current.body}</p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={finish}>
            Skip
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => {
              if (last) finish();
              else setStep((n) => n + 1);
            }}
          >
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
