"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { pushSpeedSample, SPEED_STORAGE_KEY, SpeedSample } from "@/lib/speed";

function readSamples(): SpeedSample[] {
  try {
    const raw = sessionStorage.getItem(SPEED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SpeedSample[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSamples(samples: SpeedSample[]) {
  try {
    sessionStorage.setItem(SPEED_STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // Measuring is best-effort when storage is blocked.
  }
}

/** Records first load and the gap from a tap to the next screen. */
export function NavTiming() {
  const pathname = usePathname();
  const loaded = useRef(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("a,button")) return;
      performance.mark("inspekt-nav-start");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const marks = performance.getEntriesByName("inspekt-nav-start");
    const start = marks[marks.length - 1];
    let sample: SpeedSample | null = null;
    if (start && performance.now() - start.startTime < 8000) {
      sample = {
        path: pathname,
        kind: "route",
        ms: Math.round(performance.now() - start.startTime),
        at: Date.now(),
      };
    } else if (!loaded.current) {
      loaded.current = true;
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (nav) {
        const ms = nav.domContentLoadedEventEnd || nav.duration;
        if (ms > 0) {
          sample = {
            path: pathname,
            kind: "load",
            ms: Math.round(ms),
            at: Date.now(),
          };
        }
      }
    }
    performance.clearMarks("inspekt-nav-start");
    if (!sample) return;
    writeSamples(pushSpeedSample(readSamples(), sample));
  }, [pathname]);

  return null;
}
